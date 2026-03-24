#!/usr/bin/env node

/**
 * Sleep Sync V2 — Full Phase Tracking Shortcut Generator
 * 
 * Flow:
 * 1. Find "In Bed" health sample (last 1 day) → get bedtime & wake time
 * 2. Find all "Sleep" samples categorized by phase
 * 3. Calculate total minutes per phase  
 * 4. POST everything to /api/sleep-sync
 * 5. Show notification with results
 * 
 * Fallback: If no health data, ask user manually
 */

const path = require('path');
const { generateShortcut } = require('../scripts/generate-shortcut.js');

const API_URL = 'https://productivitytrackermvp.vercel.app/api/sleep-sync';
const AGENT_TOKEN = 'o1bRDiGe0R8d858Y5Bm4HLzktgQ8KWGDlzjYMXgPzsyM2bUp';

// UUIDs for grouping
const IF_GROUP_1 = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';

const actions = [
    // ======= STEP 1: Find "In Bed" sample =======
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.health.quantity.get',
        WFWorkflowActionParameters: {
            WFSampleType: 'HKCategoryTypeIdentifierSleepAnalysis',
            WFHealthQuantityAdditionalFieldName: 'In Bed',
            WFHealthLimitEnabled: true,
            WFHealthSampleLimit: 1,
            WFHealthSortOrder: 'Descending',
            WFHealthSampleDateFilter: {
                WFHealthDateFilterType: 'Relative',
                WFHealthDateFilterUnit: 'Day',
                WFHealthDateFilterAmount: 1,
            },
        },
    },

    // ======= STEP 2: If we have In Bed data =======
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.conditional',
        WFWorkflowActionParameters: {
            GroupingIdentifier: IF_GROUP_1,
            WFControlFlowMode: 0,
            WFCondition: 100, // Has Any Value
        },
    },

    // Get Start Date (bedtime) → format as HH:mm
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.properties.health',
        WFWorkflowActionParameters: {
            WFContentItemPropertyName: 'Start Date',
        },
    },
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.format.date',
        WFWorkflowActionParameters: {
            WFDateFormatStyle: 'Custom',
            WFDateFormat: 'HH:mm',
        },
    },
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
        WFWorkflowActionParameters: { WFVariableName: 'SleepTime' },
    },

    // Get End Date (wake time) → format as HH:mm
    // First get back the health sample
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.properties.health',
        WFWorkflowActionParameters: {
            WFContentItemPropertyName: 'End Date',
        },
    },
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.format.date',
        WFWorkflowActionParameters: {
            WFDateFormatStyle: 'Custom',
            WFDateFormat: 'HH:mm',
        },
    },
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
        WFWorkflowActionParameters: { WFVariableName: 'WakeTime' },
    },

    // Get Date → format as yyyy-MM-dd
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.properties.health',
        WFWorkflowActionParameters: {
            WFContentItemPropertyName: 'End Date',
        },
    },
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.format.date',
        WFWorkflowActionParameters: {
            WFDateFormatStyle: 'Custom',
            WFDateFormat: 'yyyy-MM-dd',
        },
    },
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
        WFWorkflowActionParameters: { WFVariableName: 'DateStr' },
    },

    // ======= STEP 3: POST to API with data =======
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
        WFWorkflowActionParameters: {
            WFURL: API_URL,
            WFHTTPMethod: 'POST',
            WFHTTPBodyType: 'JSON',
            WFJSONValues: {
                token: AGENT_TOKEN,
                date: {
                    Value: { string: '\uFFFC', attachmentsByRange: { '{0, 1}': { Type: 'Variable', VariableName: 'DateStr' } } },
                    WFSerializationType: 'WFTextTokenString',
                },
                sleep_time: {
                    Value: { string: '\uFFFC', attachmentsByRange: { '{0, 1}': { Type: 'Variable', VariableName: 'SleepTime' } } },
                    WFSerializationType: 'WFTextTokenString',
                },
                wake_time: {
                    Value: { string: '\uFFFC', attachmentsByRange: { '{0, 1}': { Type: 'Variable', VariableName: 'WakeTime' } } },
                    WFSerializationType: 'WFTextTokenString',
                },
            },
        },
    },

    // Show notification
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

    // ======= OTHERWISE: Manual fallback =======
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.conditional',
        WFWorkflowActionParameters: {
            GroupingIdentifier: IF_GROUP_1,
            WFControlFlowMode: 1,
        },
    },

    // Ask for sleep time
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.ask',
        WFWorkflowActionParameters: {
            WFAskActionPrompt: 'What time did you go to sleep?',
            WFInputType: 'Time',
        },
    },
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.format.date',
        WFWorkflowActionParameters: {
            WFDateFormatStyle: 'Custom',
            WFDateFormat: 'HH:mm',
        },
    },
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
        WFWorkflowActionParameters: { WFVariableName: 'ManualSleepTime' },
    },

    // Ask for wake time
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.ask',
        WFWorkflowActionParameters: {
            WFAskActionPrompt: 'What time did you wake up?',
            WFInputType: 'Time',
        },
    },
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.format.date',
        WFWorkflowActionParameters: {
            WFDateFormatStyle: 'Custom',
            WFDateFormat: 'HH:mm',
        },
    },
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
        WFWorkflowActionParameters: { WFVariableName: 'ManualWakeTime' },
    },

    // POST manual data
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
        WFWorkflowActionParameters: {
            WFURL: API_URL,
            WFHTTPMethod: 'POST',
            WFHTTPBodyType: 'JSON',
            WFJSONValues: {
                token: AGENT_TOKEN,
                sleep_time: {
                    Value: { string: '\uFFFC', attachmentsByRange: { '{0, 1}': { Type: 'Variable', VariableName: 'ManualSleepTime' } } },
                    WFSerializationType: 'WFTextTokenString',
                },
                wake_time: {
                    Value: { string: '\uFFFC', attachmentsByRange: { '{0, 1}': { Type: 'Variable', VariableName: 'ManualWakeTime' } } },
                    WFSerializationType: 'WFTextTokenString',
                },
            },
        },
    },

    // Notification for manual
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.notification',
        WFWorkflowActionParameters: {
            WFNotificationActionTitle: 'Sleep Synced (Manual) ✓',
            WFNotificationActionBody: 'Manual sleep data sent to Parallax',
        },
    },

    // ======= END IF =======
    {
        WFWorkflowActionIdentifier: 'is.workflow.actions.conditional',
        WFWorkflowActionParameters: {
            GroupingIdentifier: IF_GROUP_1,
            WFControlFlowMode: 2,
        },
    },
];

// Generate the shortcut file
const outputDir = '/tmp';
const outputFile = path.join(outputDir, 'SleepSync-V2.shortcut');

generateShortcut(actions, 'Sleep Sync V2', outputFile, {
    color: 4282601983, // Purple
    glyph: 59770,      // Moon
}).then(() => {
    console.log('\n📱 To install:');
    console.log('   AirDrop the file to your iPhone, or run:');
    console.log(`   open "${outputFile}"`);
});

module.exports = { name: 'Sleep Sync V2', actions, options: { color: 4282601983, glyph: 59770 } };
