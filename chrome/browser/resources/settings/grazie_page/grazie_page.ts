// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview 'settings-grazie-page' contains Grazie AI platform settings.
 */

import '../settings_page/settings_section.js';
import '../settings_page_styles.css.js';
import '../settings_shared.css.js';
import '../controls/settings_toggle_button.js';
import 'chrome://resources/cr_elements/cr_button/cr_button.js';
import 'chrome://resources/cr_elements/cr_icon/cr_icon.js';
import 'chrome://resources/cr_elements/icons.html.js';
import 'chrome://resources/cr_elements/cr_shared_style.css.js';

import {PrefsMixin} from 'chrome://resources/js/settings/prefs/prefs_mixin.js';
import {PolymerElement} from 'chrome://resources/polymer/v3_0/polymer/polymer_bundled.min.js';

import {getTemplate} from './grazie_page.html.js';

const SettingsGraziePageElementBase = PrefsMixin(PolymerElement);

export interface GrazieModel {
  id: string;
  displayName: string;
  provider: string;
  features: string[];
  contextLimit: number;
  maxOutputTokens: number;
  deprecated: boolean;
}

export class SettingsGraziePageElement extends SettingsGraziePageElementBase {
  static get is() {
    return 'settings-grazie-page';
  }

  static get template() {
    return getTemplate();
  }

  static get properties() {
    return {
      /**
       * Preferences state.
       */
      prefs: {
        type: Object,
        notify: true,
      },

      /**
       * Connection status: 'disconnected', 'connecting', 'connected', 'error'
       */
      connectionStatus: {
        type: String,
        value: 'disconnected',
      },

      /**
       * Whether currently connecting to Grazie
       */
      isConnecting: {
        type: Boolean,
        value: false,
      },

      /**
       * Whether connected to Grazie
       */
      isConnected: {
        type: Boolean,
        value: false,
      },

      /**
       * Available models from Grazie
       */
      availableModels: {
        type: Array,
        value: () => [],
      },

      /**
       * Connection result: 'success', 'error', or null
       */
      connectionResult: {
        type: String,
        value: null,
      },

      /**
       * Connection result message
       */
      connectionResultMessage: {
        type: String,
        value: '',
      },
    };
  }

  // Declare properties to satisfy TypeScript
  declare prefs: any;
  declare connectionStatus: string;
  declare isConnecting: boolean;
  declare isConnected: boolean;
  declare availableModels: GrazieModel[];
  declare connectionResult: string | null;
  declare connectionResultMessage: string;

  private grazieClient_: any = null;
  private connectionTimeout_: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    // Import the Grazie client
    this.loadGrazieClient_();
    // Check if we already have a valid connection
    this.checkExistingConnection_();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.connectionTimeout_) {
      clearTimeout(this.connectionTimeout_);
    }
  }

  /**
   * Load the Grazie client script
   */
  private async loadGrazieClient_() {
    try {
      // Load the Grazie client script
      const script = document.createElement('script');
      script.src = 'chrome://resources/js/grazie/grazie_client.js';
      script.onload = () => {
        this.grazieClient_ = (window as any).GrazieClient;
      };
      document.head.appendChild(script);
    } catch (error) {
      console.error('Failed to load Grazie client:', error);
    }
  }

  /**
   * Check if there's an existing connection
   */
  private checkExistingConnection_() {
    const jwtToken = this.prefs?.grazie?.jwt_token?.value;
    const environment = this.prefs?.grazie?.environment?.value || 'staging';
    
    if (jwtToken && this.grazieClient_) {
      // Try to connect with existing token
      this.testConnection_();
    }
  }

  /**
   * Get CSS class for connection status
   */
  private getConnectionStatusClass_(status: string): string {
    switch (status) {
      case 'connected':
        return 'connected';
      case 'connecting':
        return 'connecting';
      case 'error':
      case 'disconnected':
      default:
        return '';
    }
  }

  /**
   * Get connection status text
   */
  private getConnectionStatusText_(status: string): string {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  }

  /**
   * Get test button class
   */
  private getTestButtonClass_(isConnecting: boolean): string {
    return isConnecting ? 'test-connection-btn connecting' : 'test-connection-btn';
  }

  /**
   * Get test button disabled state
   */
  private getTestButtonDisabled_(jwtToken: string, isConnecting: boolean): boolean {
    return !jwtToken || isConnecting;
  }

  /**
   * Get test button text
   */
  private getTestButtonText_(isConnecting: boolean): string {
    return isConnecting ? 'Connecting...' : 'Test Connection';
  }

  /**
   * Get connection result class
   */
  private getConnectionResultClass_(result: string | null): string {
    if (!result) return '';
    return result === 'success' ? 'success' : 'error';
  }

  /**
   * Check if models are available
   */
  private hasModels_(models: GrazieModel[]): boolean {
    return models && models.length > 0;
  }

  /**
   * Get models count text
   */
  private getModelsCountText_(models: GrazieModel[]): string {
    const count = models?.length || 0;
    return count === 1 ? '1 model available' : `${count} models available`;
  }

  /**
   * Format number with thousands separator
   */
  private formatNumber_(num: number): string {
    if (!num) return '0';
    return new Intl.NumberFormat().format(num);
  }

  /**
   * Handle JWT token change
   */
  private onJwtTokenChange_(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value;
    
    // Update preference
    // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
    this.setPrefValue('grazie.jwt_token', value);
    
    // Reset connection state
    this.connectionStatus = 'disconnected';
    this.isConnected = false;
    this.availableModels = [];
    this.connectionResult = null;
    this.connectionResultMessage = '';

    this.showStatusMessage_();
  }

  /**
   * Handle environment change
   */
  private onEnvironmentChange_(e: Event) {
    const select = e.target as HTMLSelectElement;
    const value = select.value;
    
    // Update preference
    // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
    this.setPrefValue('grazie.environment', value);
    
    // Reset connection state
    this.connectionStatus = 'disconnected';
    this.isConnected = false;
    this.availableModels = [];
    this.connectionResult = null;
    this.connectionResultMessage = '';

    this.showStatusMessage_();
  }

  /**
   * Handle default model change
   */
  private onDefaultModelChange_(e: Event) {
    const select = e.target as HTMLSelectElement;
    const value = select.value;
    
    // Update preference
    // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
    this.setPrefValue('grazie.default_model', value);
    this.showStatusMessage_();
  }

  /**
   * Handle temperature change
   */
  private onTemperatureChange_(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = parseFloat(input.value);
    
    // Update preference
    // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
    this.setPrefValue('grazie.temperature', value);
    this.showStatusMessage_();
  }

  /**
   * Handle top P change
   */
  private onTopPChange_(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = parseFloat(input.value);
    
    // Update preference
    // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
    this.setPrefValue('grazie.top_p', value);
    this.showStatusMessage_();
  }

  /**
   * Handle top K change
   */
  private onTopKChange_(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = parseInt(input.value);
    
    // Update preference
    // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
    this.setPrefValue('grazie.top_k', value);
    this.showStatusMessage_();
  }

  /**
   * Handle max tokens change
   */
  private onMaxTokensChange_(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = parseInt(input.value);
    
    // Update preference
    // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
    this.setPrefValue('grazie.max_tokens', value);
    this.showStatusMessage_();
  }

  /**
   * Test connection to Grazie
   */
  private async testConnection_() {
    if (!this.grazieClient_) {
      this.connectionResult = 'error';
      this.connectionResultMessage = 'Grazie client not loaded';
      return;
    }

    const jwtToken = this.prefs?.grazie?.jwt_token?.value;
    const environment = this.prefs?.grazie?.environment?.value || 'staging';

    if (!jwtToken) {
      this.connectionResult = 'error';
      this.connectionResultMessage = 'JWT token required';
      return;
    }

    // Set connecting state
    this.isConnecting = true;
    this.connectionStatus = 'connecting';
    this.connectionResult = null;
    this.connectionResultMessage = '';

    // Set timeout for connection
    this.connectionTimeout_ = setTimeout(() => {
      this.isConnecting = false;
      this.connectionStatus = 'error';
      this.connectionResult = 'error';
      this.connectionResultMessage = 'Connection timeout';
    }, 15000);

    try {
      // Create Grazie client
      const client = new this.grazieClient_(jwtToken, environment);
      
      // Initialize client (this validates token and loads models)
      await client.init();
      
      // Clear timeout
      if (this.connectionTimeout_) {
        clearTimeout(this.connectionTimeout_);
        this.connectionTimeout_ = null;
      }

      // Check if chat is available
      const chatAvailable = client.isChatAvailable();
      if (!chatAvailable) {
        throw new Error('Chat functionality not available');
      }

      // Get available models
      const models = client.getAvailableModels();
      
      // Update state
      this.isConnecting = false;
      this.connectionStatus = 'connected';
      this.isConnected = true;
      this.availableModels = models;
      this.connectionResult = 'success';
      this.connectionResultMessage = `Connected successfully. Found ${models.length} models.`;

      // Set default model if none selected
      const currentDefault = this.prefs?.grazie?.default_model?.value;
      if (!currentDefault && models.length > 0) {
        // Find a good default model (prefer GPT-4 variants)
        const defaultModel = models.find(m => m.id.includes('gpt-4')) || models[0];
                 // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
         this.setPrefValue('grazie.default_model', defaultModel.id);
       }

       // Update connection status preference
       // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
       this.setPrefValue('grazie.connection_status', 'connected');
       // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
       this.setPrefValue('grazie.last_connected', new Date().toISOString());

    } catch (error) {
      // Clear timeout
      if (this.connectionTimeout_) {
        clearTimeout(this.connectionTimeout_);
        this.connectionTimeout_ = null;
      }

      console.error('Grazie connection failed:', error);
      
      // Update state
      this.isConnecting = false;
      this.connectionStatus = 'error';
      this.isConnected = false;
      this.availableModels = [];
      this.connectionResult = 'error';
      this.connectionResultMessage = `Connection failed: ${error.message}`;

             // Update connection status preference
       // @ts-ignore: setPrefValue exists at runtime from PrefsMixin
       this.setPrefValue('grazie.connection_status', 'error');
    }
  }

  /**
   * Show status message
   */
  private showStatusMessage_() {
    const statusMessage = this.shadowRoot!.querySelector('#statusMessage');
    if (statusMessage) {
      statusMessage.classList.add('show');
      setTimeout(() => {
        statusMessage.classList.remove('show');
      }, 2000);
    }
  }

  /**
   * Get current Grazie client instance
   */
  public getGrazieClient(): any {
    if (!this.grazieClient_ || !this.isConnected) {
      return null;
    }

    const jwtToken = this.prefs?.grazie?.jwt_token?.value;
    const environment = this.prefs?.grazie?.environment?.value || 'staging';

    if (!jwtToken) {
      return null;
    }

    return new this.grazieClient_(jwtToken, environment);
  }

  /**
   * Get current parameters for AI requests
   */
  public getParameters(): any {
    return {
      temperature: this.prefs?.grazie?.temperature?.value || 1.0,
      top_p: this.prefs?.grazie?.top_p?.value || 0.95,
      top_k: this.prefs?.grazie?.top_k?.value || 50,
      max_tokens: this.prefs?.grazie?.max_tokens?.value || 1000,
    };
  }

  /**
   * Get current default model
   */
  public getDefaultModel(): string {
    return this.prefs?.grazie?.default_model?.value || 'openai-gpt-4o';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-grazie-page': SettingsGraziePageElement;
  }
}

customElements.define(SettingsGraziePageElement.is, SettingsGraziePageElement); 