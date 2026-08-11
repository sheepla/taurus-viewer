declare module "foliate-js/view.js" {
  export interface LastLocation {
    /** Book-wide progress as a fraction in [0, 1]. */
    fraction?: number;
    cfi?: string;
    href?: string;
    index?: number;
    direction?: string;
    [key: string]: unknown;
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
