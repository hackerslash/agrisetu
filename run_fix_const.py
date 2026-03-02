import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()

    changed = False

    for i, line in enumerate(lines):
        if "AppLocalizations.of(context)" in line:
            # check previous lines to see if there is a const before Text or in the parent widget
            # this is a bit hacky, better approach: simply remove `const Text(` or `const Center(child: Text(`
            # or simply run flutter analyze and parse errors.
            pass

    # more reliable approach for 'const Text('
    content = "".join(lines)
    original_content = content
    content = content.replace("const Text(AppLocalizations.of(context)", "Text(AppLocalizations.of(context)")

    # fix the undefined getter
    content = content.replace("AppLocalizations.of(context)!.lookingForCluster ?? 'Looking for cluster…'", "'Looking for cluster…'")

    # remove const from parent if it has child: Text(AppLocalizations
    # e.g., const Center(child: Text(AppLocalizations...
    content = re.sub(r'const\s+([A-Za-z0-9_]+\(.*?(?:child|children):\s*\[?.*?Text\(AppLocalizations)', r'\1', content, flags=re.DOTALL)

    # Some common replacements for const
    content = content.replace("const SnackBar(content: Text(AppLocalizations", "SnackBar(content: Text(AppLocalizations")

    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('apps/mobile/lib/features'):
    for file in files:
        if file.endswith('.dart'):
            process_file(os.path.join(root, file))
