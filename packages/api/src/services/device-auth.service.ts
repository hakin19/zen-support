// Stub device authentication service
// TODO: Implement with actual database logic

export interface Device {
  id: string;
  customerId: string;
  status: 'active' | 'inactive';
}

export interface ValidationResult {
  valid: boolean;
  device?: Device;
}

export interface ActivationCodeResult {
  valid: boolean;
  customerId?: string;
  reason?: string;
}

export interface RegisterDeviceResult {
  deviceId: string;
  deviceSecret: string;
  customerId: string;
}

interface HeartbeatData {
  status: string;
  metrics?: {
    cpu: number;
    memory: number;
    uptime: number;
  };
}

export const deviceAuthService = {
  validateCredentials(
    _deviceId: string,
    _deviceSecret: string
  ): Promise<ValidationResult> {
    // TODO: Implement actual validation
    return Promise.resolve({ valid: false });
  },

  validateActivationCode(_code: string): Promise<ActivationCodeResult> {
    // TODO: Implement actual validation
    return Promise.resolve({ valid: false });
  },

  registerDevice(_params: {
    deviceId: string;
    customerId: string;
    deviceName: string;
  }): Promise<RegisterDeviceResult> {
    // TODO: Implement actual registration
    return Promise.reject(new Error('Not implemented'));
  },

  updateHeartbeat(_deviceId: string, _data: HeartbeatData): Promise<boolean> {
    // TODO: Implement actual heartbeat update
    return Promise.resolve(false);
  },
};
