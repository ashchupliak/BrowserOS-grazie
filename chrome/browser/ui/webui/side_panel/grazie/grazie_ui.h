// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_SIDE_PANEL_GRAZIE_GRAZIE_UI_H_
#define CHROME_BROWSER_UI_WEBUI_SIDE_PANEL_GRAZIE_GRAZIE_UI_H_

#include <memory>

#include "chrome/browser/ui/webui/side_panel/grazie/grazie.mojom.h"
#include "chrome/browser/ui/views/side_panel/grazie/grazie_coordinator.h"
#include "content/public/browser/web_ui_controller.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "ui/webui/mojo_bubble_web_ui_controller.h"

class GraziePageHandler;

// WebUI controller for the Grazie side panel.
class GrazieUI : public ui::MojoBubbleWebUIController,
                 public grazie::mojom::PageHandlerFactory {
 public:
  explicit GrazieUI(content::WebUI* web_ui);
  ~GrazieUI() override;

  GrazieUI(const GrazieUI&) = delete;
  GrazieUI& operator=(const GrazieUI&) = delete;

  // Instantiates the implementor of the mojom::PageHandlerFactory mojo
  // interface passing the pending receiver that will be internally bound.
  void BindInterface(
      mojo::PendingReceiver<grazie::mojom::PageHandlerFactory> receiver);

  // grazie::mojom::PageHandlerFactory:
  void CreatePageHandler(
      mojo::PendingRemote<grazie::mojom::Page> page,
      mojo::PendingReceiver<grazie::mojom::PageHandler> receiver) override;

  // Sets the coordinator for this WebUI
  void SetCoordinator(GrazieCoordinator* coordinator);
  
  // Gets the coordinator for this WebUI
  GrazieCoordinator* GetCoordinator();

  // Configuration for the WebUI
  class GrazieUIConfig : public content::WebUIConfig {
   public:
    GrazieUIConfig()
        : WebUIConfig(content::kChromeUIScheme, chrome::kChromeUIGrazieHost) {}
    
    std::unique_ptr<content::WebUIController> CreateWebUIController(
        content::WebUI* web_ui) override;
  };

 private:
  std::unique_ptr<GraziePageHandler> page_handler_;
  mojo::Receiver<grazie::mojom::PageHandlerFactory> page_factory_receiver_{
      this};
  
  raw_ptr<GrazieCoordinator> coordinator_ = nullptr;

  WEB_UI_CONTROLLER_TYPE_DECL();
};

#endif  // CHROME_BROWSER_UI_WEBUI_SIDE_PANEL_GRAZIE_GRAZIE_UI_H_ 