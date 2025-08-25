import type { Database } from '../types/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
export declare function getSupabase(): SupabaseClient<Database>;
export declare function getSupabaseAdmin(): SupabaseClient<Database> | null;
export declare const supabase: SupabaseClient<Database, "public", "public", never, {
    PostgrestVersion: "12";
}>;
export declare const supabaseAdmin: SupabaseClient<Database, "public", "public", never, {
    PostgrestVersion: "12";
}>;
export declare function createSupabaseClient(accessToken?: string): SupabaseClient<Database>;
export declare const auth: {
    signInWithOTP(email: string): Promise<{
        data: unknown;
        error: unknown;
    }>;
    verifyOTP(email: string, token: string): Promise<{
        data: unknown;
        error: unknown;
    }>;
    signOut(): Promise<{
        error: unknown;
    }>;
    getSession(): Promise<{
        data: unknown;
        error: unknown;
    }>;
    getUser(): Promise<{
        data: unknown;
        error: unknown;
    }>;
    refreshSession(): Promise<{
        data: unknown;
        error: unknown;
    }>;
};
export declare const db: {
    readonly customers: import("@supabase/postgrest-js").PostgrestQueryBuilder<{
        PostgrestVersion: "12";
    }, never, never, "customers", never>;
    readonly users: import("@supabase/postgrest-js").PostgrestQueryBuilder<{
        PostgrestVersion: "12";
    }, never, never, "users", never>;
    readonly devices: import("@supabase/postgrest-js").PostgrestQueryBuilder<{
        PostgrestVersion: "12";
    }, never, never, "devices", never>;
    readonly diagnosticSessions: import("@supabase/postgrest-js").PostgrestQueryBuilder<{
        PostgrestVersion: "12";
    }, never, never, "diagnostic_sessions", never>;
    readonly remediationActions: import("@supabase/postgrest-js").PostgrestQueryBuilder<{
        PostgrestVersion: "12";
    }, never, never, "remediation_actions", never>;
    readonly auditLogs: import("@supabase/postgrest-js").PostgrestQueryBuilder<{
        PostgrestVersion: "12";
    }, never, never, "audit_logs", never>;
    readonly networkDiagnostics: import("@supabase/postgrest-js").PostgrestQueryBuilder<{
        PostgrestVersion: "12";
    }, never, never, "network_diagnostics", never>;
    readonly alerts: import("@supabase/postgrest-js").PostgrestQueryBuilder<{
        PostgrestVersion: "12";
    }, never, never, "alerts", never>;
};
export declare const realtime: {
    subscribeToDeviceStatus(customerId: string, callback: (payload: unknown) => void): ReturnType<typeof supabase.channel>;
    subscribeToSessions(customerId: string, callback: (payload: unknown) => void): ReturnType<typeof supabase.channel>;
    subscribeToAlerts(customerId: string, callback: (payload: unknown) => void): ReturnType<typeof supabase.channel>;
    unsubscribe(channel: ReturnType<typeof supabase.channel>): Promise<"ok" | "timed out" | "error">;
};
export declare const storage: {
    uploadFile(bucket: string, path: string, file: ArrayBuffer | ArrayBufferView | Buffer): Promise<{
        data: unknown;
        error: unknown;
    }>;
    getPublicUrl(bucket: string, path: string): string;
    deleteFile(bucket: string, paths: string[]): Promise<{
        data: unknown;
        error: unknown;
    }>;
};
//# sourceMappingURL=supabase.d.ts.map