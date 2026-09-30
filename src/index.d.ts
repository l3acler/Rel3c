/**
 * mini-framework public type definitions (Phase 0 placeholder)
 */

export const VERSION: string;

export interface FrameworkInfo {
  readonly name: string;
  readonly version: string;
  readonly phase: string;
  readonly capabilities: readonly string[];
}

export const FRAMEWORK_INFO: FrameworkInfo;

export interface AppConfig {
  target?: HTMLElement | null;
  initialState?: Record<string, unknown>;
  seed?: number;
  actions?: Record<string, Function>;
  view?: (context: { state: Record<string, unknown>; dispatch: Function }) => unknown;
}

export interface AppInstance {
  version: string;
  mounted: boolean;
  mount(target: HTMLElement): AppInstance;
  dispose(): void;
}

export function createApp(config?: AppConfig): AppInstance;
