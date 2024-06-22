# Dotfiles symlinked on my machine

## One command install
```bash
./setup.sh
```

### Install with stow:
```bash
stow .
```

### Homebrew installation:
```bash
# Leaving a machine
brew leaves > leaves.txt

# Fresh installation
xargs brew install < leaves.txt
```
