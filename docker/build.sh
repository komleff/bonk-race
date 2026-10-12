#!/bin/bash
# =============================================================================
# Slime Arena Docker Build Script
# Universal script for Linux and macOS
# Version: 0.7.3
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MODE="monolith"
VERSION=$(cat ../version.json 2>/dev/null | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
VERSION=${VERSION:-"0.7.3"}
REGISTRY="ghcr.io/komleff"
PUSH=false
SEED=false
PLATFORM=""

# =============================================================================
# Functions
# =============================================================================

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║           Slime Arena Docker Build Script v${VERSION}           ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_usage() {
    echo -e "${YELLOW}Usage:${NC} $0 [OPTIONS] [MODE]"
    echo ""
    echo -e "${YELLOW}Modes:${NC}"
    echo "  monolith    All-in-one container (PostgreSQL + Redis + Servers + Client)"
    echo "  app-db      Two containers: app (servers) + db (PostgreSQL/Redis)"
    echo "  db-only     Only database container (PostgreSQL + Redis)"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  -v, --version VERSION    Set version tag (default: ${VERSION})"
    echo "  -r, --registry REGISTRY  Set registry (default: ${REGISTRY})"
    echo "  -p, --push               Push images to registry after build"
    echo "  -s, --seed               Seed initial data (first player)"
    echo "  --platform PLATFORM      Target platform (linux/amd64, linux/arm64, or both)"
    echo "  -h, --help               Show this help message"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  $0 monolith                    # Build monolith for current platform"
    echo "  $0 app-db --push               # Build app+db and push to registry"
    echo "  $0 monolith --platform linux/amd64,linux/arm64  # Multi-platform build"
    echo "  $0 monolith --seed             # Build with initial data seeding"
}

detect_platform() {
    OS=$(uname -s)
    ARCH=$(uname -m)

    echo -e "${BLUE}Detected OS:${NC} ${OS}"
    echo -e "${BLUE}Detected Arch:${NC} ${ARCH}"

    case "${OS}" in
        Linux*)     OS_TYPE="linux";;
        Darwin*)    OS_TYPE="darwin";;
        CYGWIN*|MINGW*|MSYS*) OS_TYPE="windows";;
        *)          OS_TYPE="unknown";;
    esac

    case "${ARCH}" in
        x86_64|amd64)   ARCH_TYPE="amd64";;
        aarch64|arm64)  ARCH_TYPE="arm64";;
        *)              ARCH_TYPE="unknown";;
    esac

    if [ -z "${PLATFORM}" ]; then
        PLATFORM="linux/${ARCH_TYPE}"
    fi

    echo -e "${BLUE}Target Platform:${NC} ${PLATFORM}"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed or not in PATH${NC}"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo -e "${RED}Error: Docker daemon is not running${NC}"
        exit 1
    fi

    echo -e "${GREEN}Docker is ready${NC}"
}

build_monolith() {
    echo -e "${YELLOW}Building Monolith container...${NC}"

    local TAG="${REGISTRY}/slime-arena-monolith:${VERSION}"
    local DOCKERFILE="docker/monolith-full.Dockerfile"

    # Check if multi-platform build
    if [[ "${PLATFORM}" == *","* ]]; then
        echo -e "${BLUE}Multi-platform build: ${PLATFORM}${NC}"
        docker buildx build \
            --platform "${PLATFORM}" \
            -f "${DOCKERFILE}" \
            -t "${TAG}" \
            -t "${REGISTRY}/slime-arena-monolith:latest" \
            ${PUSH:+--push} \
            ..
    else
        docker build \
            --platform "${PLATFORM}" \
            -f "${DOCKERFILE}" \
            -t "${TAG}" \
            -t "${REGISTRY}/slime-arena-monolith:latest" \
            ..

        if [ "${PUSH}" = true ]; then
            docker push "${TAG}"
            docker push "${REGISTRY}/slime-arena-monolith:latest"
        fi
    fi

    echo -e "${GREEN}Monolith build complete: ${TAG}${NC}"
}

build_app_db() {
    echo -e "${YELLOW}Building App + DB containers...${NC}"

    local APP_TAG="${REGISTRY}/bonk-race-app:${VERSION}"
    local DB_TAG="${REGISTRY}/bonk-race-db:${VERSION}"

    # Build DB container
    echo -e "${BLUE}Building DB container...${NC}"
    docker build \
        --platform "${PLATFORM}" \
        -f docker/db.Dockerfile \
        -t "${DB_TAG}" \
        -t "${REGISTRY}/bonk-race-db:latest" \
        ..

    # Build App container
    echo -e "${BLUE}Building App container...${NC}"
    docker build \
        --platform "${PLATFORM}" \
        -f docker/app.Dockerfile \
        -t "${APP_TAG}" \
        -t "${REGISTRY}/bonk-race-app:latest" \
        ..

    if [ "${PUSH}" = true ]; then
        docker push "${APP_TAG}"
        docker push "${REGISTRY}/bonk-race-app:latest"
        docker push "${DB_TAG}"
        docker push "${REGISTRY}/bonk-race-db:latest"
    fi

    echo -e "${GREEN}App + DB build complete${NC}"
    echo -e "  App: ${APP_TAG}"
    echo -e "  DB:  ${DB_TAG}"
}

build_db_only() {
    echo -e "${YELLOW}Building DB-only container...${NC}"

    local TAG="${REGISTRY}/bonk-race-db:${VERSION}"

    docker build \
        --platform "${PLATFORM}" \
        -f docker/db.Dockerfile \
        -t "${TAG}" \
        -t "${REGISTRY}/bonk-race-db:latest" \
        ..

    if [ "${PUSH}" = true ]; then
        docker push "${TAG}"
        docker push "${REGISTRY}/bonk-race-db:latest"
    fi

    echo -e "${GREEN}DB build complete: ${TAG}${NC}"
}

seed_data() {
    echo -e "${YELLOW}Seeding initial data...${NC}"

    if [ ! -f "docker/seed-data.sql" ]; then
        echo -e "${RED}Error: seed-data.sql not found${NC}"
        return 1
    fi

    # Wait for container to be ready
    echo -e "${BLUE}Waiting for database to be ready...${NC}"
    sleep 5

    # Execute seed SQL
    docker exec -i slime-arena-postgres psql -U slime -d slime_arena < docker/seed-data.sql

    echo -e "${GREEN}Data seeding complete${NC}"
}

# =============================================================================
# Parse Arguments
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -p|--push)
            PUSH=true
            shift
            ;;
        -s|--seed)
            SEED=true
            shift
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        monolith|app-db|db-only)
            MODE="$1"
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

# =============================================================================
# Main
# =============================================================================

cd "$(dirname "$0")/.."

print_banner
detect_platform
check_docker

echo ""
echo -e "${BLUE}Build Mode:${NC} ${MODE}"
echo -e "${BLUE}Version:${NC} ${VERSION}"
echo -e "${BLUE}Registry:${NC} ${REGISTRY}"
echo -e "${BLUE}Push:${NC} ${PUSH}"
echo -e "${BLUE}Seed:${NC} ${SEED}"
echo ""

case "${MODE}" in
    monolith)
        build_monolith
        ;;
    app-db)
        build_app_db
        ;;
    db-only)
        build_db_only
        ;;
    *)
        echo -e "${RED}Unknown mode: ${MODE}${NC}"
        print_usage
        exit 1
        ;;
esac

if [ "${SEED}" = true ]; then
    seed_data
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Build completed!                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}To run the container:${NC}"
case "${MODE}" in
    monolith)
        echo "  docker-compose -f docker/docker-compose.monolith-full.yml up"
        ;;
    app-db)
        echo "  docker-compose -f docker/docker-compose.app-db.yml up"
        ;;
    db-only)
        echo "  docker-compose -f docker/docker-compose-db-only.yml up"
        ;;
esac
