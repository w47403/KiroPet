#!/usr/bin/env python3
"""Build a minimal standard VS Code / Kiro VSIX without npm dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape
import json

ROOT = Path(__file__).resolve().parent
p = json.loads((ROOT / 'package.json').read_text(encoding='utf8'))
out = ROOT.parent / f"{p['name']}-{p['version']}.vsix"
manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Id="{escape(p['name'])}" Version="{escape(p['version'])}" Language="zh-CN" Publisher="{escape(p['publisher'])}" />
    <DisplayName>{escape(p['displayName'])}</DisplayName>
    <Description xml:space="preserve">{escape(p['description'])}</Description>
    <Tags>Kiro,whale,pet,桌宠</Tags>
    <Categories>Other</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{escape(p['engines']['vscode'])}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Code.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Code.Icons" Path="extension/assets/icon.png" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Code.License" Path="extension/LICENSE" Addressable="true" />
  </Assets>
</PackageManifest>
'''
content_types = '''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="ps1" ContentType="text/plain" />
  <Default Extension="py" ContentType="text/plain" />
  <Default Extension="sh" ContentType="text/plain" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="txt" ContentType="text/plain" />
  <Override PartName="/extension.vsixmanifest" ContentType="text/xml" />
</Types>
'''
files = ['package.json', 'src/extension.js', 'scripts/WhalePet.ps1', 'scripts/WhalePet.py', 'scripts/HookSignal.ps1', 'scripts/HookSignal.sh', 'assets/whale-girl.png', 'assets/icon.png', 'README.md', 'LICENSE']
files += [f'assets/moods/{name}.png' for name in ('idle','happy','hug','sleep','done')]
with ZipFile(out, 'w', ZIP_DEFLATED, compresslevel=7) as z:
    z.writestr('extension.vsixmanifest', manifest)
    z.writestr('[Content_Types].xml', content_types)
    for rel in files:
        z.write(ROOT / rel, 'extension/' + rel)
print(out)
