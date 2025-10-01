export interface SearchResult {
  title: string;
  url: string;
  description: string;
  source: string;
  engine: string;
}

export class SearchEngineError extends Error {
  readonly engine: string;

  constructor(engine: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.engine = engine;
    this.name = "SearchEngineError";
  }
}
