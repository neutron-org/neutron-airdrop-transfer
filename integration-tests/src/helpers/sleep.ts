export const sleep = async (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

export const waitFor = async (
    fn: () => Promise<boolean>,
    timeout: number = 10000,
    interval: number = 600,
): Promise<void> => {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (await fn()) {
            break;
        }
        if (Date.now() - start > timeout) {
            throw new Error('Timeout waiting for condition');
        }
        await sleep(interval);
    }
};

export const waitResult = async<T> (
    fn: () => Promise<T>,
    ready: (t: T) => boolean,
    timeout: number = 10000,
    interval: number = 600,
): Promise<T> => {
    const start = Date.now()
    let value: T

    // eslint-disable-next-line no-constant-condition
    while (true) {
        value = await fn()
        if (ready(value)) {
            break;
        }
        if (Date.now() - start > timeout) {
            throw new Error('Timeout waiting for condition')
        }
        await sleep(interval)
    }

    return value
};

