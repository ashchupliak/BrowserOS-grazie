// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/side_panel/grazie/grazie_ui.h"

#include <memory>

#include "chrome/browser/ui/webui/side_panel/grazie/grazie_page_handler.h"
#include "chrome/browser/ui/webui/webui_util.h"
#include "chrome/common/webui_url_constants.h"
#include "chrome/grit/generated_resources.h"
#include "chrome/grit/grazie_resources.h"
#include "chrome/grit/grazie_resources_map.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "services/network/public/mojom/content_security_policy.mojom.h"
#include "ui/accessibility/accessibility_features.h"
#include "ui/base/resource/resource_bundle.h"
#include "ui/webui/color_change_listener/color_change_handler.h"

GrazieUI::GrazieUI(content::WebUI* web_ui) : ui::MojoBubbleWebUIController(web_ui) {
  // Create and add the data source
  auto source = base::WrapUnique(
      content::WebUIDataSource::Create(chrome::kChromeUIGrazieHost));
  
  // Add required resources
  webui::SetupWebUIDataSource(
      source.get(), kGrazieResources, IDR_GRAZIE_GRAZIE_HTML);
  
  // Add localized strings
  source->AddLocalizedString("grazieTitle", IDS_GRAZIE_TITLE);
  source->AddLocalizedString("grazieConnecting", IDS_GRAZIE_CONNECTING);
  source->AddLocalizedString("grazieDisconnected", IDS_GRAZIE_DISCONNECTED);
  source->AddLocalizedString("grazieConnected", IDS_GRAZIE_CONNECTED);
  source->AddLocalizedString("grazieError", IDS_GRAZIE_ERROR);
  source->AddLocalizedString("grazieModelLabel", IDS_GRAZIE_MODEL_LABEL);
  source->AddLocalizedString("grazieEnvironmentLabel", IDS_GRAZIE_ENVIRONMENT_LABEL);
  source->AddLocalizedString("grazieJwtLabel", IDS_GRAZIE_JWT_LABEL);
  source->AddLocalizedString("grazieTestConnection", IDS_GRAZIE_TEST_CONNECTION);
  source->AddLocalizedString("grazieChatPlaceholder", IDS_GRAZIE_CHAT_PLACEHOLDER);
  source->AddLocalizedString("grazieSendMessage", IDS_GRAZIE_SEND_MESSAGE);
  source->AddLocalizedString("grazieCopyContent", IDS_GRAZIE_COPY_CONTENT);
  source->AddLocalizedString("grazieContentCopied", IDS_GRAZIE_CONTENT_COPIED);
  source->AddLocalizedString("grazieNoModelsAvailable", IDS_GRAZIE_NO_MODELS_AVAILABLE);
  source->AddLocalizedString("grazieAdvancedSettings", IDS_GRAZIE_ADVANCED_SETTINGS);
  source->AddLocalizedString("grazieTemperature", IDS_GRAZIE_TEMPERATURE);
  source->AddLocalizedString("grazieMaxTokens", IDS_GRAZIE_MAX_TOKENS);
  source->AddLocalizedString("grazieTopP", IDS_GRAZIE_TOP_P);
  
  // Configure CSP for secure operation
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ScriptSrc,
      "script-src chrome://resources chrome://webui-test 'self' 'unsafe-inline' 'unsafe-eval';");
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ConnectSrc,
      "connect-src https: 'self';");
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::StyleSrc,
      "style-src chrome://resources chrome://theme 'self' 'unsafe-inline';");
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ImgSrc,
      "img-src chrome://resources chrome://theme data: 'self';");
  
  // Disable trusted types for now
  source->DisableTrustedTypesCSP();
  
  // Add the source to the WebUI
  content::WebUIDataSource::Add(web_ui->GetWebContents()->GetBrowserContext(),
                                source.release());
  
  // Enable color change listener
  auto color_provider_handler = std::make_unique<ui::ColorChangeHandler>();
  color_provider_handler->Init(web_ui, source.get());
  
  web_ui->AddMessageHandler(std::move(color_provider_handler));
}

GrazieUI::~GrazieUI() = default;

void GrazieUI::BindInterface(
    mojo::PendingReceiver<grazie::mojom::PageHandlerFactory> receiver) {
  page_factory_receiver_.reset();
  page_factory_receiver_.Bind(std::move(receiver));
}

void GrazieUI::CreatePageHandler(
    mojo::PendingRemote<grazie::mojom::Page> page,
    mojo::PendingReceiver<grazie::mojom::PageHandler> receiver) {
  DCHECK(page);
  page_handler_ = std::make_unique<GraziePageHandler>(
      std::move(receiver), std::move(page), this);
}

void GrazieUI::SetCoordinator(GrazieCoordinator* coordinator) {
  coordinator_ = coordinator;
  if (page_handler_) {
    page_handler_->SetCoordinator(coordinator);
  }
}

GrazieCoordinator* GrazieUI::GetCoordinator() {
  return coordinator_;
}

// static
std::unique_ptr<content::WebUIController> GrazieUI::GrazieUIConfig::CreateWebUIController(
    content::WebUI* web_ui) {
  return std::make_unique<GrazieUI>(web_ui);
}

WEB_UI_CONTROLLER_TYPE_IMPL(GrazieUI) 