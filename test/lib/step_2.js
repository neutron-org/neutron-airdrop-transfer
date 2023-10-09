"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Step2 = void 0;
async function Step2(c, claimerAddress) {
    console.log('Step 2 - create hub ica');
    const createhubicares = await c.client.execute(c.owner, claimerAddress, {
        create_hub_i_c_a: {},
    }, 'auto', 'create hub ica', []);
    console.log('createhubicares ' + JSON.stringify(createhubicares));
}
exports.Step2 = Step2;
