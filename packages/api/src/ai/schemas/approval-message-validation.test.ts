import { describe, it, expect } from 'vitest';
import { SDKMessageValidator } from './sdk-message-validation';

describe('ApprovalMessage Validation', () => {
  describe('validateApprovalMessage', () => {
    it('should accept valid approval message with all fields', () => {
      const message = {
        type: 'approval_response',
        approvalId: 'approval-123',
        approved: true,
        reason: 'Looks good to proceed',
        modifiedInput: { script: 'updated script content' },
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(message);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid approval message with minimal fields', () => {
      const message = {
        type: 'approval_response',
        approvalId: 'approval-456',
        approved: false,
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(message);
      expect(result.error).toBeUndefined();
    });

    it('should accept approval message with optional reason', () => {
      const message = {
        type: 'approval_response',
        approvalId: 'approval-789',
        approved: true,
        reason: 'Security check passed',
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(true);
      expect(result.data?.reason).toBe('Security check passed');
    });

    it('should reject message with missing type', () => {
      const message = {
        approvalId: 'approval-123',
        approved: true,
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      const errorMessage = SDKMessageValidator.getErrorMessage(result.error!);
      expect(errorMessage).toContain('type');
    });

    it('should reject message with wrong type', () => {
      const message = {
        type: 'different_type',
        approvalId: 'approval-123',
        approved: true,
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject message with missing approvalId', () => {
      const message = {
        type: 'approval_response',
        approved: true,
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      const errorMessage = SDKMessageValidator.getErrorMessage(result.error!);
      expect(errorMessage).toContain('approvalId');
    });

    it('should reject message with empty approvalId', () => {
      const message = {
        type: 'approval_response',
        approvalId: '',
        approved: true,
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      const errorMessage = SDKMessageValidator.getErrorMessage(result.error!);
      expect(errorMessage).toContain('approvalId');
    });

    it('should reject message with missing approved field', () => {
      const message = {
        type: 'approval_response',
        approvalId: 'approval-123',
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      const errorMessage = SDKMessageValidator.getErrorMessage(result.error!);
      expect(errorMessage).toContain('approved');
    });

    it('should reject message with non-boolean approved field', () => {
      const message = {
        type: 'approval_response',
        approvalId: 'approval-123',
        approved: 'yes' as any,
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should accept any value for modifiedInput', () => {
      const testCases = [
        { value: null, desc: 'null' },
        { value: 'string value', desc: 'string' },
        { value: 123, desc: 'number' },
        { value: { complex: { nested: 'object' } }, desc: 'nested object' },
        { value: ['array', 'of', 'values'], desc: 'array' },
      ];

      for (const testCase of testCases) {
        const message = {
          type: 'approval_response',
          approvalId: 'approval-123',
          approved: true,
          modifiedInput: testCase.value,
        };

        const result = SDKMessageValidator.validateApprovalMessage(message);
        expect(result.valid).toBe(true);
        expect(result.data?.modifiedInput).toEqual(testCase.value);
      }
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedInputs = [null, undefined, 123, 'not an object', [], true];

      for (const input of malformedInputs) {
        const result = SDKMessageValidator.validateApprovalMessage(input);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should provide clear error messages', () => {
      const message = {
        type: 'approval_response',
        approvalId: 123 as any, // Wrong type
        approved: 'maybe' as any, // Wrong type
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(false);
      const errorMessage = SDKMessageValidator.getErrorMessage(result.error!);
      expect(errorMessage).toBeTruthy();
      expect(errorMessage.length).toBeGreaterThan(0);
    });
  });

  describe('getErrorMessage', () => {
    it('should format error messages with field paths', () => {
      const message = {
        type: 'approval_response',
        approvalId: '',
        approved: 'not-a-boolean' as any,
      };

      const result = SDKMessageValidator.validateApprovalMessage(message);
      expect(result.valid).toBe(false);
      const errorMessage = SDKMessageValidator.getErrorMessage(result.error!);

      // Should contain field names in the error message
      expect(errorMessage).toContain('approvalId');
    });

    it('should handle missing error gracefully', () => {
      const errorMessage = SDKMessageValidator.getErrorMessage(
        undefined as any
      );
      expect(errorMessage).toBe('Validation error');
    });
  });
});
