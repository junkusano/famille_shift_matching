export {};

declare global {
  function fetch(
    input: RequestInfo | URL,
    init?: Omit<RequestInit, "body"> & { body?: BodyInit | Uint8Array | null },
  ): Promise<Response>;
}
