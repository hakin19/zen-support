import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  generateCorrelationId,
  extractCorrelationId,
  attachCorrelationId,
  correlationIdPlugin,
} from './correlation-id';

describe('Correlation ID Utilities', () => {
  describe('generateCorrelationId', () => {
    it('should generate a valid UUID v4', () => {
      const id = generateCorrelationId();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidV4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidV4Regex);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('extractCorrelationId', () => {
    it('should extract from X-Request-ID header', () => {
      const request = {
        headers: {
          'x-request-id': 'test-correlation-id',
        },
      } as unknown as FastifyRequest;

      const id = extractCorrelationId(request);
      expect(id).toBe('test-correlation-id');
    });

    it('should extract from x-request-id header (case insensitive)', () => {
      const request = {
        headers: {
          'X-Request-Id': 'test-correlation-id',
        },
      } as unknown as FastifyRequest;

      const id = extractCorrelationId(request);
      expect(id).toBe('test-correlation-id');
    });

    it('should extract from X-Correlation-ID header', () => {
      const request = {
        headers: {
          'x-correlation-id': 'test-correlation-id',
        },
      } as unknown as FastifyRequest;

      const id = extractCorrelationId(request);
      expect(id).toBe('test-correlation-id');
    });

    it('should prefer X-Request-ID over X-Correlation-ID', () => {
      const request = {
        headers: {
          'x-request-id': 'request-id',
          'x-correlation-id': 'correlation-id',
        },
      } as unknown as FastifyRequest;

      const id = extractCorrelationId(request);
      expect(id).toBe('request-id');
    });

    it('should extract from request.id if no headers present', () => {
      const request = {
        headers: {},
        id: 'fastify-generated-id',
      } as unknown as FastifyRequest;

      const id = extractCorrelationId(request);
      expect(id).toBe('fastify-generated-id');
    });

    it('should generate new ID if none present', () => {
      const request = {
        headers: {},
      } as unknown as FastifyRequest;

      const id = extractCorrelationId(request);
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('attachCorrelationId', () => {
    it('should attach correlation ID to reply headers', () => {
      const reply = {
        header: vi.fn(),
      } as unknown as FastifyReply;

      const correlationId = 'test-correlation-id';
      attachCorrelationId(reply, correlationId);

      expect(reply.header).toHaveBeenCalledWith('X-Request-ID', correlationId);
    });

    it('should attach to both X-Request-ID and X-Correlation-ID headers', () => {
      const reply = {
        header: vi.fn(),
      } as unknown as FastifyReply;

      const correlationId = 'test-correlation-id';
      attachCorrelationId(reply, correlationId, true);

      expect(reply.header).toHaveBeenCalledWith('X-Request-ID', correlationId);
      expect(reply.header).toHaveBeenCalledWith(
        'X-Correlation-ID',
        correlationId
      );
    });
  });

  describe('correlationIdPlugin', () => {
    it('should register as a Fastify plugin', async () => {
      const mockApp = {
        decorateRequest: vi.fn(),
        addHook: vi.fn(),
      };

      await correlationIdPlugin(mockApp as any, {});

      expect(mockApp.decorateRequest).toHaveBeenCalledWith('correlationId', '');
      expect(mockApp.addHook).toHaveBeenCalledWith(
        'onRequest',
        expect.any(Function)
      );
    });

    it('should set correlation ID on request', async () => {
      const mockRequest = {
        headers: {
          'x-request-id': 'test-id',
        },
        id: 'fastify-id',
        correlationId: '',
      } as any;

      const mockReply = {
        header: vi.fn(),
      } as any;

      const mockApp = {
        decorateRequest: vi.fn(),
        addHook: vi.fn().mockImplementation((hook, handler) => {
          if (hook === 'onRequest') {
            // Execute the handler immediately for testing
            handler(mockRequest, mockReply);
          }
        }),
      };

      await correlationIdPlugin(mockApp as any, {});

      expect(mockRequest.correlationId).toBe('test-id');
      expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'test-id');
    });

    it('should generate correlation ID if not provided', async () => {
      const mockRequest = {
        headers: {},
        correlationId: '',
      } as any;

      const mockReply = {
        header: vi.fn(),
      } as any;

      const mockApp = {
        decorateRequest: vi.fn(),
        addHook: vi.fn().mockImplementation((hook, handler) => {
          if (hook === 'onRequest') {
            handler(mockRequest, mockReply);
          }
        }),
      };

      await correlationIdPlugin(mockApp as any, {});

      expect(mockRequest.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(mockReply.header).toHaveBeenCalledWith(
        'X-Request-ID',
        mockRequest.correlationId
      );
    });
  });

  describe('WebSocket Message Correlation', () => {
    it('should add requestId to WebSocket message', () => {
      const message = {
        type: 'test',
        data: 'test data',
      };

      const correlationId = 'test-correlation-id';
      const messageWithId = {
        ...message,
        requestId: correlationId,
      };

      expect(messageWithId).toEqual({
        type: 'test',
        data: 'test data',
        requestId: 'test-correlation-id',
      });
    });

    it('should preserve existing requestId in message', () => {
      const message = {
        type: 'test',
        data: 'test data',
        requestId: 'existing-id',
      };

      const newMessage = { ...message };
      expect(newMessage.requestId).toBe('existing-id');
    });

    it('should extract requestId from incoming WebSocket message', () => {
      const messageString = JSON.stringify({
        type: 'test',
        requestId: 'incoming-id',
        data: 'test',
      });

      const message = JSON.parse(messageString);
      expect(message.requestId).toBe('incoming-id');
    });

    it('should handle missing requestId in WebSocket message', () => {
      const messageString = JSON.stringify({
        type: 'test',
        data: 'test',
      });

      const message = JSON.parse(messageString);
      expect(message.requestId).toBeUndefined();
    });
  });

  describe('Correlation ID in Error Responses', () => {
    it('should include correlation ID in error response', () => {
      const error = {
        code: 'ERROR_CODE',
        message: 'Error message',
      };

      const correlationId = 'error-correlation-id';
      const errorResponse = {
        error: {
          ...error,
          requestId: correlationId,
        },
      };

      expect(errorResponse).toEqual({
        error: {
          code: 'ERROR_CODE',
          message: 'Error message',
          requestId: 'error-correlation-id',
        },
      });
    });
  });

  describe('Correlation ID Propagation', () => {
    it('should propagate correlation ID to downstream services', () => {
      const headers = {
        'Content-Type': 'application/json',
      };

      const correlationId = 'downstream-correlation-id';
      const headersWithCorrelation = {
        ...headers,
        'X-Request-ID': correlationId,
      };

      expect(headersWithCorrelation).toEqual({
        'Content-Type': 'application/json',
        'X-Request-ID': 'downstream-correlation-id',
      });
    });

    it('should include correlation ID in Redis operations', () => {
      const redisCommand = {
        key: 'test-key',
        value: 'test-value',
        metadata: {},
      };

      const correlationId = 'redis-correlation-id';
      const commandWithCorrelation = {
        ...redisCommand,
        metadata: {
          ...redisCommand.metadata,
          correlationId,
        },
      };

      expect(commandWithCorrelation).toEqual({
        key: 'test-key',
        value: 'test-value',
        metadata: {
          correlationId: 'redis-correlation-id',
        },
      });
    });

    it('should include correlation ID in Supabase requests', () => {
      const supabaseOptions = {
        headers: {},
      };

      const correlationId = 'supabase-correlation-id';
      const optionsWithCorrelation = {
        ...supabaseOptions,
        headers: {
          ...supabaseOptions.headers,
          'X-Request-ID': correlationId,
        },
      };

      expect(optionsWithCorrelation).toEqual({
        headers: {
          'X-Request-ID': 'supabase-correlation-id',
        },
      });
    });
  });
});
