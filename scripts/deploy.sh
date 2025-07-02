#!/bin/bash

# Deployment script for Claude Code AI Collaboration MCP Server
# Supports multiple deployment targets: local, docker, kubernetes, cloud

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_TYPE="${1:-local}"
ENVIRONMENT="${2:-production}"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Show usage
show_usage() {
    cat << EOF
Usage: $0 [deployment_type] [environment]

Deployment Types:
  local       - Local development deployment
  docker      - Docker container deployment
  k8s         - Kubernetes deployment
  cloud       - Cloud platform deployment (AWS/GCP/Azure)

Environments:
  development - Development environment
  staging     - Staging environment
  production  - Production environment (default)

Examples:
  $0 local development
  $0 docker production
  $0 k8s staging
  $0 cloud production

Environment Variables:
  DEEPSEEK_API_KEY    - Required: DeepSeek API key
  OPENAI_API_KEY      - Optional: OpenAI API key
  ANTHROPIC_API_KEY   - Optional: Anthropic API key
  DOCKER_REGISTRY     - Docker registry for k8s/cloud deployments
  KUBECONFIG          - Kubernetes config for k8s deployments
EOF
}

# Validate environment
validate_environment() {
    log_info "Validating environment..."
    
    if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
        log_error "DEEPSEEK_API_KEY is required"
        exit 1
    fi
    
    # Check Node.js version
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $NODE_VERSION -lt 18 ]]; then
            log_error "Node.js 18+ is required (found: $(node --version))"
            exit 1
        fi
    else
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed"
        exit 1
    fi
    
    log_success "Environment validation passed"
}

# Build project
build_project() {
    log_info "Building project..."
    
    cd "$PROJECT_ROOT"
    
    # Install dependencies
    pnpm install --frozen-lockfile
    
    # Run linting
    pnpm run lint
    
    # Run tests
    pnpm run test
    
    # Build
    pnpm run build
    
    log_success "Project built successfully"
}

# Local deployment
deploy_local() {
    log_info "Deploying locally..."
    
    # Copy configuration
    if [[ ! -f "config/${ENVIRONMENT}.yaml" ]]; then
        log_warning "Config file config/${ENVIRONMENT}.yaml not found, using default"
        cp config/default.yaml "config/${ENVIRONMENT}.yaml"
    fi
    
    # Start the server
    log_info "Starting MCP server locally..."
    NODE_ENV="$ENVIRONMENT" node dist/index.js &
    SERVER_PID=$!
    
    # Wait for server to start
    sleep 3
    
    # Test if server is running
    if kill -0 $SERVER_PID 2>/dev/null; then
        log_success "MCP server started successfully (PID: $SERVER_PID)"
        echo "$SERVER_PID" > .server.pid
        log_info "To stop the server: kill \$(cat .server.pid)"
    else
        log_error "Failed to start MCP server"
        exit 1
    fi
}

# Docker deployment
deploy_docker() {
    log_info "Deploying with Docker..."
    
    # Build Docker image
    log_info "Building Docker image..."
    docker build -t claude-code-ai-collab-mcp:latest .
    
    # Stop existing container if running
    if docker ps -q -f name=claude-mcp-server > /dev/null; then
        log_info "Stopping existing container..."
        docker stop claude-mcp-server
        docker rm claude-mcp-server
    fi
    
    # Create network if it doesn't exist
    if ! docker network ls | grep -q mcp-network; then
        docker network create mcp-network
    fi
    
    # Start Redis if not running
    if ! docker ps | grep -q claude-mcp-redis; then
        log_info "Starting Redis container..."
        docker run -d \
            --name claude-mcp-redis \
            --network mcp-network \
            -v redis-data:/data \
            redis:7-alpine \
            redis-server --appendonly yes
    fi
    
    # Start MCP server container
    log_info "Starting MCP server container..."
    docker run -d \
        --name claude-mcp-server \
        --network mcp-network \
        -p 3000:3000 \
        -e NODE_ENV="$ENVIRONMENT" \
        -e DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
        -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
        -e ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
        -e REDIS_URL="redis://claude-mcp-redis:6379" \
        -v "${PROJECT_ROOT}/logs:/app/logs" \
        claude-code-ai-collab-mcp:latest
    
    # Wait for container to start
    sleep 5
    
    # Check container status
    if docker ps | grep -q claude-mcp-server; then
        log_success "Docker deployment successful"
        log_info "Container logs: docker logs claude-mcp-server"
        log_info "Stop container: docker stop claude-mcp-server"
    else
        log_error "Docker deployment failed"
        docker logs claude-mcp-server
        exit 1
    fi
}

# Kubernetes deployment
deploy_k8s() {
    log_info "Deploying to Kubernetes..."
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    # Check if cluster is accessible
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Create namespace if it doesn't exist
    kubectl create namespace claude-mcp --dry-run=client -o yaml | kubectl apply -f -
    
    # Build and push Docker image
    REGISTRY="${DOCKER_REGISTRY:-localhost:5000}"
    IMAGE_TAG="${REGISTRY}/claude-code-ai-collab-mcp:${ENVIRONMENT}-$(git rev-parse --short HEAD)"
    
    log_info "Building and pushing Docker image: $IMAGE_TAG"
    docker build -t "$IMAGE_TAG" .
    docker push "$IMAGE_TAG"
    
    # Generate Kubernetes manifests
    mkdir -p k8s
    
    # ConfigMap
    cat > k8s/configmap.yaml << EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: claude-mcp-config
  namespace: claude-mcp
data:
  NODE_ENV: "$ENVIRONMENT"
  MCP_PROTOCOL: "sse"
  MCP_PORT: "3000"
  MCP_DEFAULT_PROVIDER: "deepseek"
EOF
    
    # Secret
    cat > k8s/secret.yaml << EOF
apiVersion: v1
kind: Secret
metadata:
  name: claude-mcp-secrets
  namespace: claude-mcp
type: Opaque
stringData:
  DEEPSEEK_API_KEY: "$DEEPSEEK_API_KEY"
  OPENAI_API_KEY: "${OPENAI_API_KEY:-}"
  ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY:-}"
EOF
    
    # Deployment
    cat > k8s/deployment.yaml << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-mcp-server
  namespace: claude-mcp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: claude-mcp-server
  template:
    metadata:
      labels:
        app: claude-mcp-server
    spec:
      containers:
      - name: mcp-server
        image: $IMAGE_TAG
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: claude-mcp-config
        - secretRef:
            name: claude-mcp-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
EOF
    
    # Service
    cat > k8s/service.yaml << EOF
apiVersion: v1
kind: Service
metadata:
  name: claude-mcp-service
  namespace: claude-mcp
spec:
  selector:
    app: claude-mcp-server
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
EOF
    
    # Apply manifests
    kubectl apply -f k8s/
    
    # Wait for deployment
    kubectl rollout status deployment/claude-mcp-server -n claude-mcp
    
    log_success "Kubernetes deployment successful"
    kubectl get pods -n claude-mcp
    kubectl get service -n claude-mcp
}

# Cloud deployment
deploy_cloud() {
    log_info "Cloud deployment is not implemented yet"
    log_info "Please use docker or k8s deployment types for cloud platforms"
    exit 1
}

# Cleanup function
cleanup() {
    if [[ -f .server.pid ]]; then
        PID=$(cat .server.pid)
        if kill -0 $PID 2>/dev/null; then
            log_info "Stopping server (PID: $PID)..."
            kill $PID
        fi
        rm .server.pid
    fi
}

# Main execution
main() {
    log_info "Starting deployment: $DEPLOYMENT_TYPE ($ENVIRONMENT)"
    
    # Show usage for help flags
    if [[ "$DEPLOYMENT_TYPE" == "-h" || "$DEPLOYMENT_TYPE" == "--help" ]]; then
        show_usage
        exit 0
    fi
    
    # Validate inputs
    if [[ ! "$DEPLOYMENT_TYPE" =~ ^(local|docker|k8s|cloud)$ ]]; then
        log_error "Invalid deployment type: $DEPLOYMENT_TYPE"
        show_usage
        exit 1
    fi
    
    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        show_usage
        exit 1
    fi
    
    # Setup cleanup trap
    trap cleanup EXIT
    
    # Execute deployment
    validate_environment
    build_project
    
    case $DEPLOYMENT_TYPE in
        local)
            deploy_local
            ;;
        docker)
            deploy_docker
            ;;
        k8s)
            deploy_k8s
            ;;
        cloud)
            deploy_cloud
            ;;
    esac
    
    log_success "Deployment completed successfully!"
}

# Run main function
main "$@"