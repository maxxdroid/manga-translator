#!/bin/bash
# Download PaddleOCR ONNX models for Manga Translate
# Run this script from the project root: bash scripts/download-models.sh

set -e

MODELS_DIR="public/models"
BASE_URL="https://github.com/aiptimizer/TurboOCR/releases/download/models-v2.1.0"

echo "Downloading PaddleOCR ONNX models..."
echo ""

# Create directories
mkdir -p "$MODELS_DIR/det"
mkdir -p "$MODELS_DIR/ch"
mkdir -p "$MODELS_DIR/ko"

# Detection model (4.6 MB)
echo "Downloading text detection model (4.6 MB)..."
curl -L -o "$MODELS_DIR/det/det.onnx" "$BASE_URL/det.onnx"

# Japanese/Chinese recognition model (80.6 MB)
echo "Downloading Japanese/Chinese recognition model (80.6 MB)..."
curl -L -o "$MODELS_DIR/ch/rec-chinese-server.onnx" "$BASE_URL/rec-chinese-server.onnx"

# Korean recognition model (12.8 MB)
echo "Downloading Korean recognition model (12.8 MB)..."
curl -L -o "$MODELS_DIR/ko/rec-korean.onnx" "$BASE_URL/rec-korean.onnx"

# Dictionaries
echo "Downloading Chinese/Japanese dictionary..."
curl -L -o "$MODELS_DIR/ch/ppocrv5_dict.txt" "$BASE_URL/dict-chinese.txt"

echo "Downloading Korean dictionary..."
curl -L -o "$MODELS_DIR/ko/ppocrv5_korean_dict.txt" "$BASE_URL/dict-korean.txt"

echo ""
echo "✓ All models downloaded to $MODELS_DIR"
echo ""
echo "Now rebuild the extension:"
echo "  npm run build"
