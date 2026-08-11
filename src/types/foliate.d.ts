declare module "foliate-js/view.js" {
  export class View extends HTMLElement {
    isFixedLayout: boolean;
    lastLocation: any;
    history: any;
    book: any;
    open(book: any): Promise<void>;
    init(options?: { lastLocation?: any; showTextStart?: boolean }): Promise<void>;
    close(): void;
    goToTextStart(): Promise<any>;
    goTo(target: any): Promise<any>;
  }
}
