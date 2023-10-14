import crypto from "crypto";

export const getIBCDenom = (portName, channelName, denom: string): string => {
    const uatomIBCHash = crypto
        .createHash('sha256')
        .update(`${portName}/${channelName}/${denom}`)
        .digest('hex')
        .toUpperCase();
    return `ibc/${uatomIBCHash}`;
};
