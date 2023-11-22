.PHONY: schema test clippy proto-gen build fmt

schema:
	@cargo schema

test:
	@cargo test

clippy:
	@cargo clippy --all --all-targets -- -D warnings

fmt:
	@cargo fmt -- --check

check_contracts:
	@cargo install cosmwasm-check --version 1.4.0 --locked
	@cosmwasm-check --available-capabilities iterator,staking,stargate,neutron artifacts/*.wasm

compile:
	@./build_release.sh

build: schema clippy fmt test compile check_contracts
