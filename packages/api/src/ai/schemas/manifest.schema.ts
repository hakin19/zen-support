import { z } from 'zod';

/**
 * Schema for validating script execution manifests
 * Ensures manifests have required fields and valid values before database persistence
 */
export const scriptManifestSchema = z.object({
  interpreter: z
    .enum(['bash', 'sh', 'python3', 'node'])
    .describe('Script interpreter'),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(3600)
    .describe('Execution timeout in seconds'),
  requiredCapabilities: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Required system capabilities'),
  environmentVariables: z
    .record(z.string(), z.string())
    .optional()
    .default({})
    .describe('Environment variables for script execution'),
  rollbackScript: z
    .string()
    .optional()
    .describe('Script to run if rollback is needed'),
  workingDirectory: z
    .string()
    .optional()
    .default('/tmp')
    .describe('Working directory'),
  maxRetries: z.number().int().min(0).max(3).optional().default(0),
  retryDelay: z.number().int().min(0).max(60).optional().default(5),
});

export type ScriptManifest = z.infer<typeof scriptManifestSchema>;

/**
 * Sanitizes and validates a manifest object
 * @param manifest - Raw manifest object from untrusted source
 * @returns Validated and sanitized manifest
 * @throws ZodError if validation fails
 */
export function validateManifest(manifest: unknown): ScriptManifest {
  // Parse and validate the manifest
  const validated = scriptManifestSchema.parse(manifest);

  // Additional sanitization for security
  // Remove any potentially dangerous environment variables
  const dangerousEnvVars = [
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'PATH',
    'PYTHONPATH',
  ];
  if (validated.environmentVariables) {
    for (const key of dangerousEnvVars) {
      delete validated.environmentVariables[key];
    }
  }

  return validated;
}

/**
 * Safe parse that returns a default manifest on validation failure
 * @param manifest - Raw manifest object
 * @returns Valid manifest or default safe values
 */
export function safeParseManifest(manifest: unknown): ScriptManifest {
  const result = scriptManifestSchema.safeParse(manifest);

  if (result.success) {
    return result.data;
  }

  // Return safe defaults if validation fails
  return {
    interpreter: 'bash',
    timeout: 60,
    requiredCapabilities: [],
    environmentVariables: {},
    workingDirectory: '/tmp',
    maxRetries: 0,
    retryDelay: 5,
  };
}
