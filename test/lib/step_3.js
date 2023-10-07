"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Step3 = void 0;
async function Step3(c, claimerAddress) {
    console.log('Step 3 check');
    const balanceAfter = await c.client.getBalance(claimerAddress, 'untrn');
    console.log('Balance of claimer account (should be 0): ' + JSON.stringify(balanceAfter));
    console.log('Stage: ' + await c.client.queryContractSmart(claimerAddress, { stage: {} }));
}
exports.Step3 = Step3;
