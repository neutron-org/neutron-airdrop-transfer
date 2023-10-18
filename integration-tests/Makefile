APP_DIR ?= ../..
COMPOSE ?= docker-compose

build-gaia:
		@docker buildx build --load --build-context app=$(APP_DIR)/gaia --build-context setup=$(APP_DIR)/neutron/network -t gaia-node-airdroptest -f dockerbuilds/Dockerfile.gaia --build-arg BINARY=gaiad .

build-neutron:
		cd $(APP_DIR)/neutron && $(MAKE) build-docker-image

build-hermes:
		@docker build -f dockerbuilds/Dockerfile.hermes -t hermes-airdroptest .

build-all: build-gaia build-neutron build-hermes
