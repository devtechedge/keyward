/**
 * Consumer adapters.
 *
 * A consumer is a place a secret lives and has to be updated during a
 * rotation. The adapter interface is the seam: each one knows how to read a
 * value back and how to write a new one, and the rotation engine does not need
 * to know which is which.
 *
 * The interface is deliberately small. `read` returning null means the
 * destination cannot be read, which is different from reading an empty value.
 */

export type ConsumerType =
  | "dotenv"
  | "vercel"
  | "github"
  | "supabase"
  | "command";

export interface ConsumerContext {
  /** The rotation run this write belongs to. */
  readonly runId: string;
  /** The name of the secret being rotated. */
  readonly secretName: string;
}

export interface ConsumerAdapter {
  readonly type: ConsumerType;
  /** A human readable description of where this consumer keeps the value. */
  describe(consumer: Consumer): string;
  /** Read the current value, or null when it cannot be read. */
  read(consumer: Consumer, context?: ConsumerContext): Promise<string | null>;
  /** Write a new value. */
  write(consumer: Consumer, value: string, context: ConsumerContext): Promise<void>;
}

/** A consumer as it appears in a plan file. It never holds a value. */
export interface Consumer {
  readonly type: ConsumerType;
  /** Project, repository or file path, depending on the type. */
  readonly target: string;
  /** Variable or key name inside the target. */
  readonly name: string;
  /** Environment names, for a hosted target. */
  readonly environments?: readonly string[];
  readonly note?: string;
}

export interface ConsumerAdapterRegistry {
  get(type: ConsumerType): ConsumerAdapter;
  list(): readonly ConsumerAdapter[];
}
