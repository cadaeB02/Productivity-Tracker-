#!/usr/bin/env node

/**
 * iOS Shortcut Generator
 * 
 * Generates .shortcut (binary plist) files from a JavaScript action definition.
 * 
 * Usage:
 *   node generate-shortcut.js <config.js> <output.shortcut>
 *   
 * Or import as module:
 *   const { generateShortcut } = require('./generate-shortcut');
 *   await generateShortcut(actions, 'Name', '/path/output.shortcut');
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function uuid() {
    return crypto.randomUUID().toUpperCase();
}

/**
 * Convert a JS value to XML plist format
 */
function toPlistXml(value, indent = '') {
    if (value === null || value === undefined) {
        return `${indent}<string></string>`;
    }
    if (typeof value === 'boolean') {
        return value ? `${indent}<true/>` : `${indent}<false/>`;
    }
    if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            return `${indent}<integer>${value}</integer>`;
        }
        return `${indent}<real>${value}</real>`;
    }
    if (typeof value === 'string') {
        const escaped = value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return `${indent}<string>${escaped}</string>`;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return `${indent}<array/>`;
        }
        let xml = `${indent}<array>\n`;
        for (const item of value) {
            xml += toPlistXml(item, indent + '\t') + '\n';
        }
        xml += `${indent}</array>`;
        return xml;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) {
            return `${indent}<dict/>`;
        }
        let xml = `${indent}<dict>\n`;
        for (const key of keys) {
            xml += `${indent}\t<key>${key}</key>\n`;
            xml += toPlistXml(value[key], indent + '\t') + '\n';
        }
        xml += `${indent}</dict>`;
        return xml;
    }
    return `${indent}<string>${String(value)}</string>`;
}

/**
 * Generate a .shortcut file from an array of actions
 * 
 * @param {Array} actions - Array of action objects with WFWorkflowActionIdentifier and WFWorkflowActionParameters
 * @param {string} name - Shortcut name
 * @param {string} outputPath - Path to write the .shortcut file
 * @param {object} options - Optional: icon config { color, glyph }
 */
async function generateShortcut(actions, name, outputPath, options = {}) {
    const workflow = {
        WFWorkflowMinimumClientVersionString: '900',
        WFWorkflowMinimumClientVersion: 900,
        WFWorkflowClientVersion: '2302.0.4',
        WFWorkflowClientRelease: '2302.0.4',
        WFWorkflowIcon: {
            WFWorkflowIconStartColor: options.color || 4282601983, // Default purple
            WFWorkflowIconGlyphNumber: options.glyph || 59770, // Moon icon
        },
        WFWorkflowImportQuestions: [],
        WFWorkflowTypes: ['NCWidget', 'WatchKit'],
        WFWorkflowInputContentItemClasses: [
            'WFAppStoreAppContentItem',
            'WFArticleContentItem',
            'WFContactContentItem',
            'WFDateContentItem',
            'WFEmailAddressContentItem',
            'WFGenericFileContentItem',
            'WFImageContentItem',
            'WFiTunesProductContentItem',
            'WFLocationContentItem',
            'WFDCMapsLinkContentItem',
            'WFAVAssetContentItem',
            'WFPDFContentItem',
            'WFPhoneNumberContentItem',
            'WFRichTextContentItem',
            'WFSafariWebPageContentItem',
            'WFStringContentItem',
            'WFURLContentItem',
        ],
        WFWorkflowActions: actions,
    };

    const plistXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${toPlistXml(workflow)}
</plist>`;

    // Write XML plist to temp file
    const tmpXml = path.join('/tmp', `shortcut_${Date.now()}.xml`);
    fs.writeFileSync(tmpXml, plistXml, 'utf8');

    // Convert to binary plist using plutil
    const absOutput = path.resolve(outputPath);
    fs.copyFileSync(tmpXml, absOutput);
    
    try {
        execSync(`plutil -convert binary1 "${absOutput}"`, { stdio: 'pipe' });
    } catch (e) {
        // If plutil fails, the XML plist might still work on newer iOS
        console.warn('Warning: plutil conversion failed, file saved as XML plist');
    }

    // Cleanup
    try { fs.unlinkSync(tmpXml); } catch {}

    console.log(`✅ Shortcut saved to: ${absOutput}`);
    return absOutput;
}

// ============ HELPER BUILDERS ============

/**
 * Create a "Find Health Samples" action
 */
function findHealthSamples({ sampleType = 'Sleep', startDateRange = 'last 1 day', sortBy = 'Start Date', order = 'Latest First', limit = null, filterValue = null }) {
    const params = {
        WFSampleType: sampleType === 'In Bed' ? 'HKCategoryTypeIdentifierSleepAnalysis' : 'HKCategoryTypeIdentifierSleepAnalysis',
        WFHealthQuantityAdditionalFieldName: sampleType,
    };

    if (limit !== null) {
        params.WFHealthSampleLimit = limit;
        params.WFHealthLimitEnabled = true;
    }

    if (sortBy) {
        params.WFHealthSortOrder = order === 'Latest First' ? 'Descending' : 'Ascending';
    }

    // Date filter — last N days
    const match = startDateRange.match(/last (\d+) day/i);
    if (match) {
        params.WFHealthSampleDateFilter = {
            WFHealthDateFilterType: 'Relative',
            WFHealthDateFilterUnit: 'Day',
            WFHealthDateFilterAmount: parseInt(match[1]),
        };
    }

    if (filterValue) {
        params.WFHealthCategoryValue = filterValue;
    }

    return {
        WFWorkflowActionIdentifier: 'is.workflow.actions.health.quantity.get',
        WFWorkflowActionParameters: params,
    };
}

/**
 * Create a "Get Contents of URL" (HTTP request) action
 */
function httpRequest({ url, method = 'POST', bodyType = 'JSON', bodyFields = {} }) {
    const fields = {};
    for (const [key, value] of Object.entries(bodyFields)) {
        if (typeof value === 'object' && value.type === 'variable') {
            fields[key] = {
                Value: {
                    string: `\uFFFC`,
                    attachmentsByRange: {
                        '{0, 1}': {
                            Type: value.actionOutput ? 'ActionOutput' : 'Variable',
                            ...(value.actionOutput ? {
                                OutputName: value.outputName || key,
                                OutputUUID: value.outputUUID,
                            } : {
                                VariableName: value.variableName,
                            }),
                        },
                    },
                },
                WFSerializationType: 'WFTextTokenString',
            };
        } else {
            fields[key] = value;
        }
    }

    return {
        WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
        WFWorkflowActionParameters: {
            WFURL: url,
            WFHTTPMethod: method,
            WFHTTPBodyType: bodyType === 'JSON' ? 'JSON' : 'Form',
            WFJSONValues: fields,
        },
    };
}

/**
 * Create an "If" conditional action
 */
function ifAction(groupingId, { input = null, condition = 'Has Any Value' } = {}) {
    const params = {
        GroupingIdentifier: groupingId,
        WFControlFlowMode: 0, // If
        WFCondition: condition === 'Has Any Value' ? 100 : 0,
    };
    if (input) {
        params.WFInput = input;
    }
    return {
        WFWorkflowActionIdentifier: 'is.workflow.actions.conditional',
        WFWorkflowActionParameters: params,
    };
}

function otherwiseAction(groupingId) {
    return {
        WFWorkflowActionIdentifier: 'is.workflow.actions.conditional',
        WFWorkflowActionParameters: {
            GroupingIdentifier: groupingId,
            WFControlFlowMode: 1,
        },
    };
}

function endIfAction(groupingId) {
    return {
        WFWorkflowActionIdentifier: 'is.workflow.actions.conditional',
        WFWorkflowActionParameters: {
            GroupingIdentifier: groupingId,
            WFControlFlowMode: 2,
        },
    };
}

/**
 * Create an "Ask for Input" action
 */
function askForInput({ prompt, inputType = 'Text' }) {
    return {
        WFWorkflowActionIdentifier: 'is.workflow.actions.ask',
        WFWorkflowActionParameters: {
            WFAskActionPrompt: prompt,
            WFInputType: inputType,
        },
    };
}

/**
 * Create a "Set Variable" action
 */
function setVariable(name) {
    return {
        WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
        WFWorkflowActionParameters: {
            WFVariableName: name,
        },
    };
}

/**
 * Create a "Show Notification" action
 */
function showNotification(title, body) {
    const params = {};
    if (title) params.WFNotificationActionTitle = title;
    if (body) params.WFNotificationActionBody = body;
    return {
        WFWorkflowActionIdentifier: 'is.workflow.actions.notification',
        WFWorkflowActionParameters: params,
    };
}

/**
 * Create a "Text" action
 */
function textAction(text) {
    return {
        WFWorkflowActionIdentifier: 'is.workflow.actions.gettext',
        WFWorkflowActionParameters: {
            WFTextActionText: text,
        },
    };
}

/**
 * Create a "Format Date" action  
 */
function formatDate(format = 'HH:mm') {
    return {
        WFWorkflowActionIdentifier: 'is.workflow.actions.format.date',
        WFWorkflowActionParameters: {
            WFDateFormatStyle: 'Custom',
            WFDateFormat: format,
        },
    };
}

// Export everything
module.exports = {
    generateShortcut,
    uuid,
    findHealthSamples,
    httpRequest,
    ifAction,
    otherwiseAction,
    endIfAction,
    askForInput,
    setVariable,
    showNotification,
    textAction,
    formatDate,
};

// CLI mode
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: node generate-shortcut.js <config.js> <output.shortcut>');
        console.log('  config.js should export { name, actions, options? }');
        process.exit(1);
    }

    const configPath = path.resolve(args[0]);
    const outputPath = args[1];
    const config = require(configPath);

    generateShortcut(config.actions, config.name, outputPath, config.options || {})
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}
