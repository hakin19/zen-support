import { createHash, randomBytes } from 'crypto';

import { KeyManagerService } from './key-manager.service';

import type { ScriptManifest } from '../schemas/manifest.schema';

/**
 * Script package structure for device execution
 */
export interface ScriptPackage {
  id: string;
  script: string; // Base64 encoded script
  manifest: ScriptManifest;
  checksum: string; // SHA-256 hash
  signature?: string; // Ed25519 signature (base64)
  createdAt: Date;
  approvalId?: string;
  deviceId?: string;
}

/**
 * Execution result from device agent
 */
export interface ExecutionResult {
  packageId: string;
  deviceId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTime: number; // milliseconds
  completedAt: Date;
  error?: string;
}

/**
 * Service for packaging approved scripts for device execution
 * Handles script packaging, signing, and result processing
 */
export class ScriptPackagerService {
  private keyManager: KeyManagerService;

  constructor() {
    // Use singleton key manager for persistent keys across instances
    this.keyManager = KeyManagerService.getInstance();
  }

  /**
   * Package an approved script with manifest and signature
   * @param script - The script content to package
   * @param manifest - Execution manifest with security constraints
   * @param approvalId - Optional approval record ID
   * @returns Complete script package ready for device execution
   */
  packageScript(
    script: string,
    manifest: ScriptManifest,
    approvalId?: string
  ): ScriptPackage {
    // Generate package ID
    const id = `pkg_${randomBytes(16).toString('hex')}`;

    // Base64 encode the script
    const encodedScript = Buffer.from(script).toString('base64');

    // Calculate checksum
    const checksum = this.calculateChecksum(script, manifest);

    // Sign the package
    const signature = this.signPackage(encodedScript, checksum);

    const scriptPackage: ScriptPackage = {
      id,
      script: encodedScript,
      manifest,
      checksum,
      signature,
      createdAt: new Date(),
      approvalId,
    };

    return scriptPackage;
  }

  /**
   * Calculate SHA-256 checksum of script and manifest
   * @param script - Raw script content
   * @param manifest - Execution manifest
   * @returns Hex-encoded checksum
   */
  private calculateChecksum(script: string, manifest: ScriptManifest): string {
    const hash = createHash('sha256');
    hash.update(script);
    hash.update(JSON.stringify(manifest));
    return hash.digest('hex');
  }

  /**
   * Sign package with Ed25519
   * @param encodedScript - Base64 encoded script
   * @param checksum - Package checksum
   * @returns Base64 encoded signature
   */
  private signPackage(encodedScript: string, checksum: string): string {
    // Create message to sign
    const message = `${encodedScript}:${checksum}`;
    const messageBytes = Buffer.from(message);

    // Sign the message using persistent key
    const signature = this.keyManager.sign(messageBytes);

    return Buffer.from(signature).toString('base64');
  }

  /**
   * Verify a package signature
   * @param scriptPackage - Package to verify
   * @returns True if signature is valid
   */
  verifyPackage(scriptPackage: ScriptPackage): boolean {
    if (!scriptPackage.signature) {
      return false;
    }

    try {
      // Recreate the signed message
      const message = `${scriptPackage.script}:${scriptPackage.checksum}`;
      const messageBytes = Buffer.from(message);

      // Decode signature
      const signature = Buffer.from(scriptPackage.signature, 'base64');

      // Verify signature using persistent key
      return this.keyManager.verify(new Uint8Array(signature), messageBytes);
    } catch {
      return false;
    }
  }

  /**
   * Validate package checksum
   * @param scriptPackage - Package to validate
   * @returns True if checksum is valid
   */
  validateChecksum(scriptPackage: ScriptPackage): boolean {
    // Decode script
    const script = Buffer.from(scriptPackage.script, 'base64').toString();

    // Recalculate checksum
    const expectedChecksum = this.calculateChecksum(
      script,
      scriptPackage.manifest
    );

    return expectedChecksum === scriptPackage.checksum;
  }

  /**
   * Process execution results from device agent
   * @param result - Execution result from device
   * @returns Processed result with validation
   */
  processExecutionResult(result: ExecutionResult): ExecutionResult {
    // Validate result structure
    if (!result.packageId || result.exitCode === undefined) {
      throw new Error('Invalid execution result');
    }

    // Sanitize output (remove sensitive data if needed)
    const sanitizedResult: ExecutionResult = {
      ...result,
      stdout: this.sanitizeOutput(result.stdout),
      stderr: this.sanitizeOutput(result.stderr),
    };

    return sanitizedResult;
  }

  /**
   * Sanitize output to remove sensitive information
   * @param output - Raw output string
   * @returns Sanitized output
   */
  private sanitizeOutput(output: string): string {
    if (!output) return '';

    // Remove common sensitive patterns
    let sanitized = output;

    // Remove API keys
    sanitized = sanitized.replace(/api[_-]?key[=:]\S+/gi, 'api_key=***');

    // Remove passwords
    sanitized = sanitized.replace(/password[=:]\S+/gi, 'password=***');

    // Remove tokens
    sanitized = sanitized.replace(/token[=:]\S+/gi, 'token=***');

    return sanitized;
  }

  /**
   * Get public key for device verification
   * @returns Base64 encoded public key
   */
  getPublicKey(): string {
    return this.keyManager.getPublicKeyBase64();
  }
}
