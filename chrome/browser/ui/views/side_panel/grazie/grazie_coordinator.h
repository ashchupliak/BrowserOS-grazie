// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_SIDE_PANEL_GRAZIE_GRAZIE_COORDINATOR_H_
#define CHROME_BROWSER_UI_VIEWS_SIDE_PANEL_GRAZIE_GRAZIE_COORDINATOR_H_

#include <map>
#include <memory>
#include <string>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "base/timer/timer.h"
#include "chrome/browser/ui/browser_user_data.h"
#include "ui/accessibility/ax_node_id_forward.h"
#include "url/gurl.h"

class Browser;
class SidePanelEntryScope;
class SidePanelRegistry;

namespace ui {
struct AXNodeData;
struct AXTreeUpdate;
}  // namespace ui

namespace user_prefs {
class PrefRegistrySyncable;
}  // namespace user_prefs

namespace views {
class View;
}  // namespace views

// GrazieCoordinator handles the creation and registration of the
// Grazie AI chat SidePanelEntry, replacing the ThirdPartyLlmPanelCoordinator.
class GrazieCoordinator : public BrowserUserData<GrazieCoordinator> {
 public:
  explicit GrazieCoordinator(Browser* browser);
  ~GrazieCoordinator() override;

  void CreateAndRegisterEntry(SidePanelRegistry* global_registry);
  
  // Registers user preferences
  static void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry);
  
  // Cycles to the next AI model
  void CycleModel();
  
  // Model management
  std::vector<std::string> GetAvailableModels();
  void SetSelectedModel(const std::string& model);
  std::string GetSelectedModel() const;
  
  // Copy page content functionality
  void CopyPageContent();

 private:
  friend class BrowserUserData<GrazieCoordinator>;
  
  BROWSER_USER_DATA_KEY_DECL();

  // Creates the Grazie WebUI view
  std::unique_ptr<views::View> CreateGrazieWebUIView(
      SidePanelEntryScope& scope);
  
  // Accessibility tree processing for content extraction
  void OnAccessibilityTreeReceived(ui::AXTreeUpdate& update);
  void ExtractTextFromNodeData(
      const ui::AXNodeData* node,
      const std::map<ui::AXNodeID, const ui::AXNodeData*>& node_map,
      std::u16string* output);
  
  // Notification methods for UI updates
  void NotifyModelChanged();
  void NotifyContentCopied();

  // Current selected model
  std::string selected_model_ = "openai-gpt-4o";
  
  // Timer for auto-hiding feedback messages
  std::unique_ptr<base::OneShotTimer> feedback_timer_;
  
  // Temporary storage for page info during copy
  std::u16string page_title_;
  GURL page_url_;

  // Weak pointer factory for callbacks
  base::WeakPtrFactory<GrazieCoordinator> weak_factory_{this};
};

#endif  // CHROME_BROWSER_UI_VIEWS_SIDE_PANEL_GRAZIE_GRAZIE_COORDINATOR_H_ 