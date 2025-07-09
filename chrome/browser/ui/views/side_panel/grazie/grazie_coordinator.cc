// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/side_panel/grazie/grazie_coordinator.h"

#include <memory>
#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/sequenced_task_runner.h"
#include "base/time/time.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_window.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/views/side_panel/side_panel_coordinator.h"
#include "chrome/browser/ui/views/side_panel/side_panel_entry.h"
#include "chrome/browser/ui/views/side_panel/side_panel_registry.h"
#include "chrome/browser/ui/views/side_panel/side_panel_web_ui_view.h"
#include "chrome/browser/ui/webui/side_panel/grazie/grazie_ui.h"
#include "chrome/grit/generated_resources.h"
#include "components/prefs/pref_service.h"
#include "components/user_prefs/user_prefs.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "ui/accessibility/ax_node_data.h"
#include "ui/accessibility/ax_tree_update.h"
#include "ui/base/clipboard/clipboard.h"
#include "ui/base/clipboard/scoped_clipboard_writer.h"
#include "ui/base/ui_base_features.h"
#include "ui/views/controls/separator.h"
#include "ui/views/layout/box_layout.h"
#include "ui/views/layout/flex_layout.h"
#include "ui/views/view.h"

namespace {
const char kGrazieSelectedModelPref[] = "grazie.selected_model";
const char kGrazieLastUsedModelsPref[] = "grazie.last_used_models";
}

GrazieCoordinator::GrazieCoordinator(Browser* browser)
    : BrowserUserData<GrazieCoordinator>(*browser),
      feedback_timer_(std::make_unique<base::OneShotTimer>()) {
  // Load saved model preference
  PrefService* prefs = browser->profile()->GetPrefs();
  if (prefs->HasPrefPath(kGrazieSelectedModelPref)) {
    selected_model_ = prefs->GetString(kGrazieSelectedModelPref);
  }
}

GrazieCoordinator::~GrazieCoordinator() {
  // Cancel any pending timer callbacks
  if (feedback_timer_ && feedback_timer_->IsRunning()) {
    feedback_timer_->Stop();
  }
}

void GrazieCoordinator::CreateAndRegisterEntry(
    SidePanelRegistry* global_registry) {
  global_registry->Register(std::make_unique<SidePanelEntry>(
      SidePanelEntry::Id::kThirdPartyLlm,
      base::BindRepeating(&GrazieCoordinator::CreateGrazieWebUIView,
                          base::Unretained(this))));
}

std::unique_ptr<views::View> GrazieCoordinator::CreateGrazieWebUIView(
    SidePanelEntryScope& scope) {
  // Create a SidePanelWebUIView that hosts the Grazie WebUI
  auto webui_view = std::make_unique<SidePanelWebUIView>(
      base::RepeatingClosure(), base::RepeatingClosure(),
      std::make_unique<GrazieUI::GrazieUIConfig>());
  
  // Set up the WebUI view
  webui_view->SetVisible(true);
  webui_view->ShowUI();
  
  // Get the WebUI instance and set up the coordinator reference
  if (auto* web_ui = webui_view->GetWebUI()) {
    if (auto* grazie_ui = web_ui->GetController()->GetAs<GrazieUI>()) {
      grazie_ui->SetCoordinator(this);
    }
  }
  
  return webui_view;
}

void GrazieCoordinator::CycleModel() {
  // Get available models and cycle to the next one
  std::vector<std::string> available_models = GetAvailableModels();
  if (available_models.empty()) {
    return;
  }
  
  // Find current model index
  size_t current_index = 0;
  for (size_t i = 0; i < available_models.size(); ++i) {
    if (available_models[i] == selected_model_) {
      current_index = i;
      break;
    }
  }
  
  // Cycle to next model
  size_t next_index = (current_index + 1) % available_models.size();
  selected_model_ = available_models[next_index];
  
  // Save preference
  PrefService* prefs = GetBrowser().profile()->GetPrefs();
  if (prefs) {
    prefs->SetString(kGrazieSelectedModelPref, selected_model_);
  }
  
  // Notify UI about model change
  NotifyModelChanged();
}

std::vector<std::string> GrazieCoordinator::GetAvailableModels() {
  // This will be populated by the WebUI via JavaScript
  // For now, return a basic list of common models
  return {
    "openai-gpt-4o",
    "openai-gpt-4-turbo",
    "anthropic-claude-3-5-sonnet",
    "anthropic-claude-3-opus",
    "google-gemini-1.5-pro",
    "google-gemini-1.5-flash"
  };
}

void GrazieCoordinator::SetSelectedModel(const std::string& model) {
  if (model == selected_model_) {
    return;
  }
  
  selected_model_ = model;
  
  // Save preference
  PrefService* prefs = GetBrowser().profile()->GetPrefs();
  if (prefs) {
    prefs->SetString(kGrazieSelectedModelPref, model);
  }
  
  // Notify UI about model change
  NotifyModelChanged();
}

std::string GrazieCoordinator::GetSelectedModel() const {
  return selected_model_;
}

void GrazieCoordinator::CopyPageContent() {
  // Get the active tab's web contents
  TabStripModel* tab_strip_model = GetBrowser().tab_strip_model();
  if (!tab_strip_model) {
    return;
  }

  content::WebContents* active_contents = tab_strip_model->GetActiveWebContents();
  if (!active_contents) {
    return;
  }
  
  // Store the title and URL for later use
  page_title_ = active_contents->GetTitle();
  page_url_ = active_contents->GetVisibleURL();
  
  // Request accessibility tree snapshot
  active_contents->RequestAXTreeSnapshot(
      base::BindOnce(&GrazieCoordinator::OnAccessibilityTreeReceived,
                     weak_factory_.GetWeakPtr()),
      ui::AXMode::kWebContents,
      0,  // max_nodes (0 = no limit)
      base::Seconds(5),  // timeout
      content::WebContents::AXTreeSnapshotPolicy::kSameOriginDirectDescendants);
}

void GrazieCoordinator::OnAccessibilityTreeReceived(
    ui::AXTreeUpdate& update) {
  // Build a map of node IDs to node data for easy lookup
  std::map<ui::AXNodeID, const ui::AXNodeData*> node_map;
  for (const auto& node_data : update.nodes) {
    node_map[node_data.id] = &node_data;
  }
  
  // Find the root node
  ui::AXNodeID root_id = update.root_id;
  if (node_map.find(root_id) == node_map.end()) {
    LOG(ERROR) << "Root node not found in tree update";
    return;
  }
  
  // Extract text from the accessibility tree recursively
  std::u16string extracted_text;
  ExtractTextFromNodeData(node_map[root_id], node_map, &extracted_text);
  
  // Clean up text - remove excessive whitespace
  if (!extracted_text.empty()) {
    // Simple cleanup of multiple spaces
    size_t pos = 0;
    while ((pos = extracted_text.find(u"  ", pos)) != std::u16string::npos) {
      extracted_text.replace(pos, 2, u" ");
    }
    
    // Format the final output
    std::u16string formatted_output = u"----------- WEB PAGE -----------\n\n";
    formatted_output += u"TITLE: " + page_title_ + u"\n\n";
    formatted_output += u"URL: " + base::UTF8ToUTF16(page_url_.spec()) + u"\n\n";
    formatted_output += u"CONTENT:\n\n" + extracted_text;
    formatted_output += u"\n\n----------- END PAGE -----------\n\n";
    
    // Copy to clipboard
    ui::ScopedClipboardWriter clipboard_writer(ui::ClipboardBuffer::kCopyPaste);
    clipboard_writer.WriteText(formatted_output);
    
    // Notify the UI about successful copy
    NotifyContentCopied();
  }
}

void GrazieCoordinator::ExtractTextFromNodeData(
    const ui::AXNodeData* node,
    const std::map<ui::AXNodeID, const ui::AXNodeData*>& node_map,
    std::u16string* output) {
  if (!node || !output) {
    return;
  }
  
  // Skip non-visible elements
  if (node->HasState(ax::mojom::State::kInvisible)) {
    return;
  }
  
  // Skip script and style elements
  if (node->role == ax::mojom::Role::kNone ||
      node->role == ax::mojom::Role::kGenericContainer ||
      node->role == ax::mojom::Role::kScript ||
      node->role == ax::mojom::Role::kStyle) {
    // Continue to children for containers
    for (ui::AXNodeID child_id : node->child_ids) {
      auto it = node_map.find(child_id);
      if (it != node_map.end()) {
        ExtractTextFromNodeData(it->second, node_map, output);
      }
    }
    return;
  }
  
  // Extract text content
  if (node->HasStringAttribute(ax::mojom::StringAttribute::kName)) {
    std::u16string text = base::UTF8ToUTF16(
        node->GetStringAttribute(ax::mojom::StringAttribute::kName));
    if (!text.empty()) {
      *output += text + u" ";
    }
  }
  
  // Add paragraph breaks for block-level elements
  bool needs_paragraph_break = (node->role == ax::mojom::Role::kParagraph ||
                               node->role == ax::mojom::Role::kHeading ||
                               node->role == ax::mojom::Role::kListItem ||
                               node->role == ax::mojom::Role::kBlockquote ||
                               node->role == ax::mojom::Role::kArticle ||
                               node->role == ax::mojom::Role::kSection);
  
  if (needs_paragraph_break && !output->empty() && output->back() != '\n') {
    *output += u"\n\n";
  }
  
  // Recursively process children
  for (ui::AXNodeID child_id : node->child_ids) {
    auto it = node_map.find(child_id);
    if (it != node_map.end()) {
      ExtractTextFromNodeData(it->second, node_map, output);
    }
  }
  
  // Add paragraph break after block-level elements
  if (needs_paragraph_break && !output->empty() && output->back() != '\n') {
    *output += u"\n\n";
  }
}

void GrazieCoordinator::NotifyModelChanged() {
  // This would notify the WebUI about the model change
  // Implementation depends on the WebUI messaging system
}

void GrazieCoordinator::NotifyContentCopied() {
  // This would notify the WebUI about successful content copy
  // Implementation depends on the WebUI messaging system
}

// static
void GrazieCoordinator::RegisterProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry) {
  registry->RegisterStringPref(kGrazieSelectedModelPref, "openai-gpt-4o");
  registry->RegisterListPref(kGrazieLastUsedModelsPref);
}

BROWSER_USER_DATA_KEY_IMPL(GrazieCoordinator); 