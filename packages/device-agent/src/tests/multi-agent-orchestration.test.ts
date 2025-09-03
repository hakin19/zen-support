import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceAgent } from '../device-agent.js';
import {
  generateDeviceId,
  parseDeviceId,
  generateFromDockerEnv,
} from '../utils/device-id-generator.js';
import type { DeviceConfig } from '../types.js';

describe('Multi-Agent Orchestration', () => {
  let agents: DeviceAgent[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    agents = [];
  });

  afterEach(() => {
    agents.forEach(agent => {
      if (agent.getStatus() === 'running') {
        agent.stop();
      }
    });
  });

  describe('Multiple Agent Instances', () => {
    it('should create multiple agents with unique IDs', () => {
      const locations = ['US-WEST', 'US-EAST', 'EU-CENTRAL'];

      locations.forEach((location, index) => {
        const config: DeviceConfig = {
          deviceId: `DEV-${location}-${String(index + 1).padStart(3, '0')}`,
          deviceSecret: `secret-${location}`,
          customerId: 'test-customer',
          apiUrl: 'http://localhost:3001',
          mockMode: true,
        };

        const agent = new DeviceAgent(config);
        agents.push(agent);

        expect(agent.getDeviceId()).toBe(config.deviceId);
      });

      expect(agents).toHaveLength(3);
      const ids = agents.map(a => a.getDeviceId());
      expect(new Set(ids).size).toBe(3);
    });

    it('should start multiple agents independently', async () => {
      const startPromises = [];

      for (let i = 1; i <= 3; i++) {
        const config: DeviceConfig = {
          deviceId: `DEV-TEST-${String(i).padStart(3, '0')}`,
          deviceSecret: `secret-${i}`,
          customerId: 'test-customer',
          apiUrl: 'http://localhost:3001',
          mockMode: true,
          heartbeatInterval: 5000,
        };

        const agent = new DeviceAgent(config);
        agents.push(agent);
        startPromises.push(agent.start());
      }

      await Promise.all(startPromises);

      agents.forEach(agent => {
        expect(agent.getStatus()).toBe('running');
        expect(agent.isConnected()).toBe(true);
      });
    });

    it('should handle agent failures independently', async () => {
      const config1: DeviceConfig = {
        deviceId: 'DEV-STABLE-001',
        deviceSecret: 'secret-1',
        customerId: 'test-customer',
        apiUrl: 'http://localhost:3001',
        mockMode: true,
      };

      const config2: DeviceConfig = {
        deviceId: 'DEV-FAILING-001',
        deviceSecret: 'secret-2',
        customerId: 'test-customer',
        apiUrl: 'http://invalid-url:9999',
        mockMode: false,
      };

      const agent1 = new DeviceAgent(config1);
      const agent2 = new DeviceAgent(config2);
      agents.push(agent1, agent2);

      await agent1.start();
      expect(agent1.getStatus()).toBe('running');

      await expect(agent2.start()).rejects.toThrow();
      expect(agent2.getStatus()).toBe('error');

      expect(agent1.getStatus()).toBe('running');
      expect(agent1.isConnected()).toBe(true);
    });
  });

  describe('Device ID Generation', () => {
    it('should generate IDs from Docker environment', () => {
      process.env.HOSTNAME = 'device-agent-us-west-1';
      process.env.DOCKER_CONTAINER = 'true';

      const id = generateFromDockerEnv();
      expect(id).toBe('DEV-US-WEST-001');

      delete process.env.HOSTNAME;
      delete process.env.DOCKER_CONTAINER;
    });

    it('should parse device IDs correctly', () => {
      const testCases = [
        {
          id: 'DEV-US-WEST-001',
          expected: {
            prefix: 'DEV',
            location: 'US-WEST',
            index: 1,
            hostname: undefined,
          },
        },
        {
          id: 'DEV-EU-CENTRAL-042',
          expected: {
            prefix: 'DEV',
            location: 'EU-CENTRAL',
            index: 42,
            hostname: undefined,
          },
        },
        {
          id: 'DEV-LOCAL-001-HOST123',
          expected: {
            prefix: 'DEV',
            location: 'LOCAL',
            index: 1,
            hostname: 'HOST123',
          },
        },
      ];

      testCases.forEach(({ id, expected }) => {
        const parsed = parseDeviceId(id);
        expect(parsed).toEqual(expected);
      });
    });

    it('should handle environment-based ID generation', () => {
      process.env.LOCATION = 'ASIA-PACIFIC';
      process.env.DEVICE_INDEX = '7';

      const id = generateDeviceId();
      expect(id).toBe('DEV-ASIA-PACIFIC-007');

      delete process.env.LOCATION;
      delete process.env.DEVICE_INDEX;
    });
  });

  describe('Agent Coordination', () => {
    it('should emit events for coordination', async () => {
      const events: Array<{ agent: string; event: string }> = [];

      for (let i = 1; i <= 2; i++) {
        const config: DeviceConfig = {
          deviceId: `DEV-COORD-${String(i).padStart(3, '0')}`,
          deviceSecret: `secret-${i}`,
          customerId: 'test-customer',
          apiUrl: 'http://localhost:3001',
          mockMode: true,
        };

        const agent = new DeviceAgent(config);
        agents.push(agent);

        agent.on('registered', () => {
          events.push({ agent: agent.getDeviceId(), event: 'registered' });
        });

        agent.on('heartbeat', () => {
          events.push({ agent: agent.getDeviceId(), event: 'heartbeat' });
        });
      }

      await Promise.all(agents.map(a => a.start()));

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(events.filter(e => e.event === 'registered')).toHaveLength(2);
      expect(events.filter(e => e.agent === 'DEV-COORD-001')).toHaveLength(2);
      expect(events.filter(e => e.agent === 'DEV-COORD-002')).toHaveLength(2);
    });

    it('should handle concurrent heartbeats', async () => {
      const heartbeatPromises = [];

      for (let i = 1; i <= 3; i++) {
        const config: DeviceConfig = {
          deviceId: `DEV-CONCURRENT-${String(i).padStart(3, '0')}`,
          deviceSecret: `secret-${i}`,
          customerId: 'test-customer',
          apiUrl: 'http://localhost:3001',
          mockMode: true,
          heartbeatInterval: 1000,
        };

        const agent = new DeviceAgent(config);
        agents.push(agent);

        let heartbeatReceived = false;
        heartbeatPromises.push(
          new Promise<void>(resolve => {
            agent.on('heartbeat', () => {
              if (!heartbeatReceived) {
                heartbeatReceived = true;
                resolve();
              }
            });
          })
        );

        await agent.start();
      }

      await Promise.race([
        Promise.all(heartbeatPromises),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Heartbeat timeout')), 5000)
        ),
      ]);

      agents.forEach(agent => {
        expect(agent.getHealthStatus().heartbeatCount).toBeGreaterThanOrEqual(
          1
        );
      });
    });
  });

  describe('Network Isolation Simulation', () => {
    it('should simulate isolated network behavior', () => {
      const networks = {
        'agent-1-network': ['DEV-US-WEST-001'],
        'agent-2-network': ['DEV-US-EAST-001'],
        'agent-3-network': ['DEV-EU-CENTRAL-001'],
        'aizen-network': [
          'DEV-US-WEST-001',
          'DEV-US-EAST-001',
          'DEV-EU-CENTRAL-001',
        ],
      };

      const canCommunicate = (agent1: string, agent2: string): boolean => {
        if (agent1 === agent2) return true;

        for (const [network, members] of Object.entries(networks)) {
          if (members.includes(agent1) && members.includes(agent2)) {
            return network === 'aizen-network';
          }
        }
        return false;
      };

      expect(canCommunicate('DEV-US-WEST-001', 'DEV-US-EAST-001')).toBe(true);
      expect(canCommunicate('DEV-US-WEST-001', 'DEV-US-WEST-001')).toBe(true);

      const isolatedNetworks = Object.entries(networks)
        .filter(([name]) => name !== 'aizen-network')
        .map(([, members]) => members);

      isolatedNetworks.forEach(network => {
        expect(network).toHaveLength(1);
      });
    });
  });

  describe('Scaling Operations', () => {
    it('should handle dynamic scaling', async () => {
      const scaleUp = async (count: number) => {
        const newAgents = [];

        for (let i = agents.length + 1; i <= agents.length + count; i++) {
          const config: DeviceConfig = {
            deviceId: `DEV-SCALE-${String(i).padStart(3, '0')}`,
            deviceSecret: `secret-${i}`,
            customerId: 'test-customer',
            apiUrl: 'http://localhost:3001',
            mockMode: true,
          };

          const agent = new DeviceAgent(config);
          newAgents.push(agent);
          await agent.start();
        }

        agents.push(...newAgents);
        return newAgents;
      };

      const scaleDown = (count: number) => {
        const removed = [];
        for (let i = 0; i < count && agents.length > 0; i++) {
          const agent = agents.pop();
          if (agent) {
            agent.stop();
            removed.push(agent);
          }
        }
        return removed;
      };

      await scaleUp(3);
      expect(agents).toHaveLength(3);
      expect(agents.every(a => a.getStatus() === 'running')).toBe(true);

      await scaleUp(2);
      expect(agents).toHaveLength(5);

      scaleDown(2);
      expect(agents).toHaveLength(3);
      expect(agents.every(a => a.getStatus() === 'running')).toBe(true);
    });

    it('should validate scaling limits', () => {
      const MAX_AGENTS = 10;
      const MIN_AGENTS = 1;

      const validateScale = (current: number, desired: number): boolean => {
        return desired >= MIN_AGENTS && desired <= MAX_AGENTS;
      };

      expect(validateScale(3, 5)).toBe(true);
      expect(validateScale(3, 11)).toBe(false);
      expect(validateScale(3, 0)).toBe(false);
      expect(validateScale(8, 10)).toBe(true);
    });
  });
});
