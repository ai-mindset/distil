"""Cross-platform uv and Ollama setup and model management."""

import subprocess
import sys
import os
import shutil
import platform
from pathlib import Path


def get_platform():
    """Detect the current platform."""
    system = platform.system().lower()
    if system == "linux":
        return "linux"
    elif system == "darwin":
        return "macos"
    elif system == "windows":
        return "windows"
    else:
        raise RuntimeError(f"Unsupported platform: {system}")


def check_ollama_installed():
    """Check if ollama is installed and accessible."""
    cmd = "ollama.exe" if get_platform() == "windows" else "ollama"
    return shutil.which(cmd) is not None


def install_ollama():
    """Install ollama for the current platform."""
    platform_type = get_platform()
    print(f"Installing Ollama for {platform_type}...")

    try:
        if platform_type == "linux":
            # Linux: use official install script
            result = subprocess.run([
                "sh", "-c", "curl -fsSL https://ollama.com/install.sh | sh"
            ], capture_output=True, text=True, timeout=300)

        elif platform_type == "macos":
            # macOS: check if Homebrew is available
            if shutil.which("brew"):
                result = subprocess.run(["brew", "install", "ollama"],
                                      capture_output=True, text=True, timeout=300)
            else:
                print("Homebrew not found. Please install Ollama manually:")
                print("1. Download from https://ollama.com/download")
                print("2. Or install Homebrew first: /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"")
                return False

        elif platform_type == "windows":
            # Windows: download and run installer
            print("Please download and install Ollama from: https://ollama.com/download")
            print("Windows automatic installation not supported. Please install manually and restart.")
            return False

        if result.returncode == 0:
            print("Ollama installed successfully")
            return True
        else:
            print(f"Installation failed: {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        print("Installation timed out")
        return False
    except Exception as e:
        print(f"Error installing Ollama: {e}")
        return False


def get_ollama_cmd():
    """Get the correct ollama command for the platform."""
    return "ollama.exe" if get_platform() == "windows" else "ollama"


def check_ollama_running():
    """Check if ollama server is running."""
    try:
        cmd = get_ollama_cmd()
        result = subprocess.run([cmd, "list"], capture_output=True, text=True, timeout=5)
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def start_ollama_server():
    """Start ollama server in background."""
    try:
        cmd = get_ollama_cmd()
        print("Starting Ollama server...")

        if get_platform() == "windows":
            # Windows: use different approach for background process
            subprocess.Popen([cmd, "serve"], creationflags=subprocess.CREATE_NEW_CONSOLE)
        else:
            # Unix-like systems
            subprocess.Popen([cmd, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Give it time to start
        import time
        time.sleep(3)
        return check_ollama_running()
    except Exception as e:
        print(f"Error starting Ollama server: {e}")
        return False


def check_model_exists(model_name):
    """Check if a model is already pulled."""
    try:
        cmd = get_ollama_cmd()
        result = subprocess.run([cmd, "list"], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            # Extract model name without provider prefix
            if "/" in model_name:
                model_name = model_name.split("/", 1)[1]
            return model_name in result.stdout
        return False
    except Exception:
        return False


def pull_model(model_name):
    """Pull the specified model."""
    # Extract model name without provider prefix for ollama
    if "/" in model_name:
        ollama_model = model_name.split("/", 1)[1]
    else:
        ollama_model = model_name

    print(f"Pulling model: {ollama_model}")
    try:
        cmd = get_ollama_cmd()
        result = subprocess.run([cmd, "pull", ollama_model],
                              capture_output=True, text=True, timeout=600)
        if result.returncode == 0:
            print(f"Model {ollama_model} pulled successfully")
            return True
        else:
            print(f"Failed to pull model: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("Model pull timed out (10 minutes)")
        return False
    except Exception as e:
        print(f"Error pulling model: {e}")
        return False


def ensure_ollama_ready(model_name):
    """Ensure Ollama is installed, running, and has the required model."""
    platform_type = get_platform()

    # Check if ollama is installed
    if not check_ollama_installed():
        print(f"Ollama not found on {platform_type}. Installing...")
        if not install_ollama():
            if platform_type == "windows":
                print("Please download Ollama from https://ollama.com/download and restart distil")
            else:
                print("Failed to install Ollama. Please install manually from https://ollama.com")
            return False

    # Check if server is running
    if not check_ollama_running():
        print("Ollama server not running. Starting...")
        if not start_ollama_server():
            cmd = get_ollama_cmd()
            print(f"Failed to start Ollama server. Please start manually with '{cmd} serve'")
            return False

    # Check if model exists
    if not check_model_exists(model_name):
        print(f"Model {model_name} not found locally.")
        if not pull_model(model_name):
            print(f"Failed to pull model {model_name}")
            return False

    print(f"Ollama ready with model: {model_name}")
    return True