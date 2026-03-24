#!/usr/bin/env node

/**
 * Sleep Sync V3 — Simplified & Reliable
 * 
 * Uses only well-known action identifiers that work on all iOS versions.
 * 
 * Flow:
 * 1. Ask user: "What time did you go to sleep?"
 * 2. Ask user: "What time did you wake up?"
 * 3. Format both as HH:mm
 * 4. Get today's date formatted as yyyy-MM-dd
 * 5. POST to /api/sleep-sync
 * 6. Show notification with result
 */

const path = require('path');
const { generateShortcut } = require('../scripts/generate-shortcut.js');

const API_URL = 'https://productivitytrackermvp.vercel.app/api/sleep-sync';
const AGENT_TOKEN = 'o1bRDiGe0R8d858Y5Bm4HLzktgQ8KWGDlzjYMXgPzsyM2bUp';

const actions = [
    // Step 1: Ask for sleep time
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.ask',
        WFWorkflowActionParameters: {
            WFAskActionPrompt: 'What time did you go to sleep?',
            WFInputType: 'Time',
        },
    },

    // Step 2: Format sleep time as HH:mm
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.format.date',
        WFWorkflowActionParameters: {
            WFDateFormatStyle: 'Custom',
            WFDateFormat: 'HH:mm',
        },
    },

    // Step 3: Save as SleepTime variable
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
        WFWorkflowActionParameters: {
            WFVariableName: 'SleepTime',
        },
    },

    // Step 4: Ask for wake time
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.ask',
        WFWorkflowActionParameters: {
            WFAskActionPrompt: 'What time did you wake up?',
            WFInputType: 'Time',
        },
    },

    // Step 5: Format wake time as HH:mm
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.format.date',
        WFWorkflowActionParameters: {
            WFDateFormatStyle: 'Custom',
            WFDateFormat: 'HH:mm',
        },
    },

    // Step 6: Save as WakeTime variable
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
        WFWorkflowActionParameters: {
            WFVariableName: 'WakeTime',
        },
    },

    // Step 7: Get current date
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.date',
        WFWorkflowActionParameters: {
            WFDateActionMode: 'Current Date',
        },
    },

    // Step 8: Format as yyyy-MM-dd
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.format.date',
        WFWorkflowActionParameters: {
            WFDateFormatStyle: 'Custom',
            WFDateFormat: 'yyyy-MM-dd',
        },
    },

    // Step 9: Save as DateStr
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
        WFWorkflowActionParameters: {
            WFVariableName: 'DateStr',
        },
    },

    // Step 10: POST to API
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
        WFWorkflowActionParameters: {
            WFURL: API_URL,
            WFHTTPMethod: 'POST',
            WFHTTPBodyType: 'JSON',
            WFJSONValues: {
                Value: {
                    WFDictionaryFieldValueItems: [
                        {
                            WFItemType: 0,
                            WFKey: { Value: { string: 'token' }, WFSerializationType: 'WFTextTokenString' },
                            WFValue: { Value: { string: AGENT_TOKEN }, WFSerializationType: 'WFTextTokenString' },
                        },
                        {
                            WFItemType: 0,
                            WFKey: { Value: { string: 'date' }, WFSerializationType: 'WFTextTokenString' },
                            WFValue: {
                                Value: {
                                    string: '\uFFFC',
                                    attachmentsByRange: {
                                        '{0, 1}': { Type: 'Variable', VariableName: 'DateStr' },
                                    },
                                },
                                WFSerializationType: 'WFTextTokenString',
                            },
                        },
                        {
                            WFItemType: 0,
                            WFKey: { Value: { string: 'sleep_time' }, WFSerializationType: 'WFTextTokenString' },
                            WFValue: {
                                Value: {
                                    string: '\uFFFC',
                                    attachmentsByRange: {
                                        '{0, 1}': { Type: 'Variable', VariableName: 'SleepTime' },
                                    },
                                },
                                WFSerializationType: 'WFTextTokenString',
                            },
                        },
                        {
                            WFItemType: 0,
                            WFKey: { Value: { string: 'wake_time' }, WFSerializationType: 'WFTextTokenString' },
                            WFValue: {
                                Value: {
                                    string: '\uFFFC',
                                    attachmentsByRange: {
                                        '{0, 1}': { Type: 'Variable', VariableName: 'WakeTime' },
                                    },
                                },
                                WFSerializationType: 'WFTextTokenString',
                            },
                        },
                    ],
                },
                WFSerializationType: 'WFDictionaryFieldValue',
            },
        },
    },

    // Step 11: Show notification
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.notification',
        WFWorkflowActionParameters: {
            WFNotificationActionTitle: 'Sleep Synced ✓',
            WFNotificationActionBody: {
                Value: {
                    string: 'Slept \uFFFC → Woke \uFFFC',
                    attachmentsByRange: {
                        '{6, 1}': { Type: 'Variable', VariableName: 'SleepTime' },
                        '{16, 1}': { Type: 'Variable', VariableName: 'WakeTime' },
                    },
                },
                WFSerializationType: 'WFTextTokenString',
            },
        },
    },
];

const outputFile = path.join('/tmp', 'SleepSync-V3.shortcut');

generateShortcut(actions, 'Sync Sleep', outputFile, {
    color: 4282601983,
    glyph: 59770,
}).then(() => {
    console.log('\n📱 Now sign it:');
    console.log(`   shortcuts sign -i "${outputFile}" -o "/tmp/SleepSync-V3-signed.shortcut" -m anyone`);
});

module.exports = { name: 'Sync Sleep', actions, options: { color: 4282601983, glyph: 59770 } };
