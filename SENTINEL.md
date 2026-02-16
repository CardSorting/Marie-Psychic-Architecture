
# 🛡️ Sentinel Report: 2/15/2026 4:58:47 PM

**Stability**: Toxic
**Entropy**: 43 (✅ Monotonic)
**Ratchet**: 🔓 OPEN

## 📊 Metrics
- **Zoning Law**: 0 violations
- **Cyclic Rot**: 0 cycles
- **Duplication**: 3 instances
- **Toxicity**: 0 hotspots

## 🗺️ Visual Architecture
```mermaid
graph TD;
  _vault_novel_src_domain_NarrativeIntegrity_ts[NarrativeIntegrity.ts] --> _vault_novel_src_plumbing_interfaces_ts[interfaces.ts];
  _vault_novel_src_infrastructure_NarrativeStressTester_ts[NarrativeStressTester.ts] --> _vault_novel_src_domain_NarrativeIntegrity_ts[NarrativeIntegrity.ts];
  _vault_novel_src_infrastructure_NarrativeStressTester_ts[NarrativeStressTester.ts] --> _vault_novel_src_plumbing_Chapter_1_skeleton_ts[Chapter_1_skeleton.ts];
  _vault_novel_src_infrastructure_NarrativeTestRunner_ts[NarrativeTestRunner.ts] --> _vault_novel_src_domain_NarrativeIntegrity_ts[NarrativeIntegrity.ts];
  _vault_novel_src_infrastructure_NarrativeTestRunner_ts[NarrativeTestRunner.ts] --> _vault_novel_src_plumbing_Chapter_1_skeleton_ts[Chapter_1_skeleton.ts];
  _vault_novel_src_plumbing_Chapter_1_skeleton_ts[Chapter_1_skeleton.ts] --> _vault_novel_src_plumbing_types_ts[types.ts];
  _vscode_test_vscode_darwin_arm64_1_109_3_Visual_Studio_Code_app_Contents_Resources_app_extensions_mermaid_chat_features_chat_webview_src_index_editor_ts[index-editor.ts] --> _vscode_test_vscode_darwin_arm64_1_109_3_Visual_Studio_Code_app_Contents_Resources_app_extensions_mermaid_chat_features_chat_webview_src_mermaidWebview_ts[mermaidWebview.ts];
  _vscode_test_vscode_darwin_arm64_1_109_3_Visual_Studio_Code_app_Contents_Resources_app_extensions_mermaid_chat_features_chat_webview_src_index_editor_ts[index-editor.ts] --> _vscode_test_vscode_darwin_arm64_1_109_3_Visual_Studio_Code_app_Contents_Resources_app_extensions_mermaid_chat_features_chat_webview_src_vscodeApi_ts[vscodeApi.ts];
  _vscode_test_vscode_darwin_arm64_1_109_3_Visual_Studio_Code_app_Contents_Resources_app_extensions_mermaid_chat_features_chat_webview_src_index_ts[index.ts] --> _vscode_test_vscode_darwin_arm64_1_109_3_Visual_Studio_Code_app_Contents_Resources_app_extensions_mermaid_chat_features_chat_webview_src_mermaidWebview_ts[mermaidWebview.ts];
  _vscode_test_vscode_darwin_arm64_1_109_3_Visual_Studio_Code_app_Contents_Resources_app_extensions_mermaid_chat_features_chat_webview_src_index_ts[index.ts] --> _vscode_test_vscode_darwin_arm64_1_109_3_Visual_Studio_Code_app_Contents_Resources_app_extensions_mermaid_chat_features_chat_webview_src_vscodeApi_ts[vscodeApi.ts];
  _vscode_test_vscode_darwin_arm64_1_109_3_Visual_Studio_Code_app_Contents_Resources_app_extensions_mermaid_chat_features_chat_webview_src_mermaidWebview_ts[mermaidWebview.ts] --> _vscode_test_vscode_darwin_arm64_1_109_3_Visual_Studio_Code_app_Contents_Resources_app_extensions_mermaid_chat_features_chat_webview_src_vscodeApi_ts[vscodeApi.ts];

```

## 📜 High-Priority Alerts


- 👯 [Semantic Duplicate] src/domain/DomainEntity.ts matches .marie-joy-test/src/domain/DomainEntity.ts
- 👯 [Semantic Duplicate] src/infrastructure/BaseAdapter.ts matches .marie-joy-test/src/infrastructure/BaseAdapter.ts
- 👯 [Semantic Duplicate] src/plumbing/BaseTool.ts matches .marie-joy-test/src/plumbing/BaseTool.ts

---
*Marie Sentinel v3.1 — Grounded Architectural Guardian*
