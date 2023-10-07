# Transfer unclaimed airdrop funds from neutron-1 to cosmoshub-4

yarn build

neutrond tx ibc-transfer transfer "transfer" "channel-189" "cosmos1mwfj5j8v2aafqqnjekeqtupgc6894033nvtgre" "100untrn" --chain-id pion-1 --home "~/.neutrond" --node "https://rpc-falcron.pion-1.ntrn.tech:443" --from "pion1_testnet_wallet" --keyring-backend test
gaiad q bank balances cosmos1mwfj5j8v2aafqqnjekeqtupgc6894033nvtgre --home ~/.gaiad-theta --node https://rpc.sentry-02.theta-testnet.polypore.xyz:443

### local
IBC_DENOM="ibc/kekw"
ENDPOINT="http://127.0.0.1:26657"
MNEMONICS="banner spread envelope side kite person disagree path silver will brother under couch edit food venture squirrel civil budget number acquire point work mass"

## 1. create channel beforehand
// WARN: testnet connection id example
hermes create channel --a-chain pion-1 --a-port transfer --b-port transfer --a-connection connection-120

// created "channel-189 <-> channel-3235" for testnet

## 2. setup contracts
node ./lib/index.js setup_contracts "$MNEMONICS" "$ENDPOINT" "connection-120" "channel-189" "$IBC_DENOM" 1

## 3. run steps
CLAIMER_ADDRESS=""

node ./lib/index.js step_1 "$MNEMONICS" "$ENDPOINT" "$CLAIMER_ADDRESS"
node ./lib/index.js step_2 "$MNEMONICS" "$ENDPOINT" "$CLAIMER_ADDRESS"
node ./lib/index.js step_3 "$MNEMONICS" "$ENDPOINT" "$CLAIMER_ADDRESS"
node ./lib/index.js step_4 "$MNEMONICS" "$ENDPOINT" "$CLAIMER_ADDRESS"
