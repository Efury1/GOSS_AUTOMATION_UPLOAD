#!/usr/bin/env bash
# Shortcut for upload-css.js, for Git Bash.
# Replaces run.cmd, which group policy blocks.
# Save this file as "run" (no extension) in the goss-upload folder, next to upload-css.js.
#
#   ./run all                     upload every site (asks which environment)
#   ./run tolhouse-gaol           upload one site
#   ./run tolhouse-gaol recycles  upload several sites
#   ./run all --env tst           upload every site to test, no questions
#   ./run                         asks which environment and which sites
#
# To type just "run all" (no ./) from any folder, add an alias once:
#   echo "alias run='bash ~/Repos/goss-upload/run'" >> ~/.bashrc
#   source ~/.bashrc

# The folder this file is in (works however it was started: ./run, bash run, or the alias)
script_folder="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Stop with a clear message if something it needs is missing
if ! command -v node > /dev/null 2>&1; then
  echo "Node.js isn't installed, or Git Bash can't find it. Install it from nodejs.org." >&2
  exit 1
fi

if [ ! -f "$script_folder/upload-css.js" ]; then
  echo "Can't find upload-css.js in $script_folder. Put this run file next to it." >&2
  exit 1
fi

# Go to that folder, so screenshots and node_modules are found in the right place
cd "$script_folder" || exit 1

# Pass on everything typed after "run" (same job as %* in run.cmd)
node upload-css.js "$@" 
