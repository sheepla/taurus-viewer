declare module "foliate-js/view.js" {
  export interface LastLocation {
    /** Book-wide progress as a fraction in [0, 1]. */
    fraction?: number;
    cfi?: string;
    href?: string;
    index?: number;
    direction?: string;
    /** The TOC entry matching the current reading position (from `book.toc`). */
    tocItem?: { label?: string; href?: string } | null;
    [key: string]: unknown;
  }

  /** A single match yielded by `View.search`. */
  export interface SearchResultItem {
    cfi: string;
    excerpt: string;
  }

  /** Progress report yielded between search results. */
  export interface SearchProgress {
    progress: number;
  }

  /** Section-scoped results (when `index` is set). */
  export interface SearchSectionResult extends SearchResultItem {}

  /** Book-wide results: one `SearchSectionResult[]` group per section. */
  export interface SearchBookResult {
    index: number;
    subitems: SearchResultItem[];
  }

  export type SearchResult =
    | SearchProgress
    | SearchSectionResult
    | SearchBookResult;

  export interface SearchOptions {
    query: string;
    index?: number | undefined;
  }

  export class View extends HTMLElement {
    isFixedLayout: boolean;
    lastLocation: LastLocation;
    history: any;
    book: any;
    open(book: any): Promise<void>;
    init(options?: { lastLocation?: unknown; showTextStart?: boolean }): Promise<void>;
    close(): void;
    goToTextStart(): Promise<any>;
    goTo(target: any): Promise<any>;
    next(): Promise<any>;
    prev(): Promise<any>;
    goLeft(): Promise<any>;
    goRight(): Promise<any>;
    search(options: SearchOptions): AsyncIterable<SearchResult | string>;
    clearSearch(): void;
    addEventListener(
      type: "relocate",
      listener: (this: View, event: CustomEvent) => void,
      options?: boolean | AddEventListenerOptions
    ): void;
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ): void;
  }
}
