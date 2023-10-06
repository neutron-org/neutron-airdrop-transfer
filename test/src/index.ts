#!/usr/bin/env node
import { program } from 'commander';

if (require.main === module) {
    program
        .name('pion-1_airdrop_transfer_test')
        .description('CLI to start your own cosmos')
        .command('start')
        // .argument('<config>', 'config file path, may me toml or json')
        .action(async (_str) => {


            console.log('🥳 Done');
        });

    program.parse();
}
