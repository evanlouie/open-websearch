/**
 * Represents a single search result from a web search engine.
 * Contains the essential metadata for displaying a search result to users.
 */
export interface SearchResult {
  /** The title of the search result */
  title: string;
  /** The URL of the search result */
  url: string;
  /** A brief description or snippet from the search result */
  description: string;
  /** The source domain or site name */
  source: string;
  /** The search engine that produced this result (e.g., "bing", "brave", "duckduckgo") */
  engine: string;
}

/**
 * Error class for search engine failures.
 * Extends the standard Error class to include the specific engine that failed.
 */
export class SearchEngineError extends Error {
  /** The name of the search engine that encountered the error */
  readonly engine: string;

  /**
   * Creates a new SearchEngineError.
   *
   * @param engine - The name of the search engine (e.g., "bing", "brave", "duckduckgo")
   * @param message - The error message describing what went wrong
   * @param options - Optional error options including cause
   */
  constructor(engine: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.engine = engine;
    this.name = "SearchEngineError";
  }
}
