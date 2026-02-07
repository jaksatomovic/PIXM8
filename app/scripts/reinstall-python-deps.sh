#!/bin/bash
# Script to reinstall Python dependencies including python-multipart

VENV_PYTHON="$HOME/Library/Application Support/io.keero/python_env/bin/python"
VENV_PIP="$HOME/Library/Application Support/io.keero/python_env/bin/pip"

if [ ! -f "$VENV_PIP" ]; then
    echo "Error: Python virtual environment not found at $VENV_PIP"
    exit 1
fi

echo "Installing python-multipart..."
"$VENV_PIP" install python-multipart --upgrade

echo "Verifying installation..."
"$VENV_PYTHON" -c "import multipart; print('✓ python-multipart is installed')" || echo "✗ python-multipart installation failed"

echo "Done!"
