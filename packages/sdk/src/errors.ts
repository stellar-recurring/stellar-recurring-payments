/** Base error for SDK failures with an optional machine-readable code. */
export class SdkError extends Error {
  readonly code: string;

  constructor(message: string, code = "SDK_ERROR", options?: ErrorOptions) {
    super(message, options);
    this.name = "SdkError";
    this.code = code;
  }
}

/** Invalid or incomplete client / network configuration. */
export class ConfigError extends SdkError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "CONFIG_ERROR", options);
    this.name = "ConfigError";
  }
}
