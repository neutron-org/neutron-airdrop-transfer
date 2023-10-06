#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
if (require.main === module) {
    commander_1.program
        .name('pion-1_airdrop_transfer_test')
        .description('CLI to start your own cosmos')
        .command('start')
        // .argument('<config>', 'config file path, may me toml or json')
        .action(async (str) => {
        console.log('🥳 Done');
    });
    commander_1.program.parse();
}
// export default Cosmopark;
// export { CosmoparkConfig };
