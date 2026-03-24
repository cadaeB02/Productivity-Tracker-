#!/usr/bin/env python3
"""
Sleep Sync Shortcut Generator — V4
Uses correct Apple Shortcuts plist format with proper HealthKit identifiers.

Flow:
1. Find Health Samples (Sleep Analysis / In Bed) from last 1 day
2. If found → extract Start Date (bedtime) and End Date (wake)
3. Format dates, POST to API
4. Otherwise → ask manually, POST to API
"""

import plistlib
import subprocess
import sys
import os
import uuid

API_URL = "https://productivitytrackermvp.vercel.app/api/sleep-sync"
AGENT_TOKEN = "o1bRDiGe0R8d858Y5Bm4HLzktgQ8KWGDlzjYMXgPzsyM2bUp"

def make_uuid():
    return str(uuid.uuid4()).upper()

def var_ref(name):
    """Create a variable reference token"""
    return {
        "Value": {
            "string": "\ufffc",
            "attachmentsByRange": {
                "{0, 1}": {
                    "Type": "Variable",
                    "VariableName": name,
                }
            }
        },
        "WFSerializationType": "WFTextTokenString",
    }

def action_output_ref(output_uuid, output_name, agg_type=None):
    """Create a magic variable reference to a previous action's output"""
    ref = {
        "Type": "ActionOutput",
        "OutputName": output_name,
        "OutputUUID": output_uuid,
    }
    if agg_type:
        ref["Aggrandizements"] = agg_type
    return {
        "Value": {
            "string": "\ufffc",
            "attachmentsByRange": {
                "{0, 1}": ref,
            }
        },
        "WFSerializationType": "WFTextTokenString",
    }

def build_shortcut():
    if_group_id = make_uuid()
    health_action_uuid = make_uuid()

    actions = []

    # ============================================================
    # ACTION 1: Find Health Samples — Sleep Analysis (In Bed)
    # ============================================================
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.filter.health.quantity",
        "WFWorkflowActionParameters": {
            "UUID": health_action_uuid,
            "WFHKSampleType": "HKCategoryTypeIdentifierSleepAnalysis",
            "WFHKQuantityType": "HKCategoryTypeIdentifierSleepAnalysis",
            "WFHealthQuantityAdditionalFieldName": "In Bed",
            "WFContentItemSortProperty": "Start Date",
            "WFContentItemSortOrder": "Latest First",
            "WFContentItemLimitEnabled": True,
            "WFContentItemLimitNumber": 1,
            "WFContentItemFilter": {
                "Value": {
                    "WFActionParameterFilterPrefix": 1,
                    "WFContentPredicateBoundedDate": False,
                    "WFActionParameterFilterTemplates": [
                        {
                            "Operator": 1003,  # "is in the last"
                            "Values": {
                                "Unit": 4,  # Days
                                "Number": 1,
                            },
                            "Property": "Start Date",
                            "Removable": True,
                        }
                    ]
                },
                "WFSerializationType": "WFContentPredicateTableTemplate",
            },
        },
    })

    # ============================================================
    # ACTION 2: If — Health Samples has any value
    # ============================================================
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": if_group_id,
            "WFControlFlowMode": 0,  # If
            "WFCondition": 100,       # Has Any Value
        },
    })

    # ============================================================
    # ACTION 3: Get Start Date of health sample → this is bedtime
    # Use "Get Details of Health Sample" or use magic variable with aggrandizement
    # ============================================================
    # Instead of a separate action, we'll use Format Date on the 
    # health sample's Start Date via aggrandizement
    
    start_date_ref = {
        "Value": {
            "string": "\ufffc",
            "attachmentsByRange": {
                "{0, 1}": {
                    "Type": "ActionOutput",
                    "OutputName": "Health Samples",
                    "OutputUUID": health_action_uuid,
                    "Aggrandizements": [
                        {
                            "Type": "WFPropertyVariableAggrandizement",
                            "PropertyName": "Start Date",
                            "PropertyUserInfo": 0,
                        }
                    ],
                }
            }
        },
        "WFSerializationType": "WFTextTokenString",
    }

    # Format Start Date → HH:mm
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.format.date",
        "WFWorkflowActionParameters": {
            "WFDateFormatStyle": "Custom",
            "WFDateFormat": "HH:mm",
            "WFDate": start_date_ref,
        },
    })

    # Set variable SleepTime
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.setvariable",
        "WFWorkflowActionParameters": {
            "WFVariableName": "SleepTime",
        },
    })

    # ============================================================
    # ACTION 4: Get End Date of health sample → this is wake time
    # ============================================================
    end_date_ref = {
        "Value": {
            "string": "\ufffc",
            "attachmentsByRange": {
                "{0, 1}": {
                    "Type": "ActionOutput",
                    "OutputName": "Health Samples",
                    "OutputUUID": health_action_uuid,
                    "Aggrandizements": [
                        {
                            "Type": "WFPropertyVariableAggrandizement",
                            "PropertyName": "End Date",
                            "PropertyUserInfo": 0,
                        }
                    ],
                }
            }
        },
        "WFSerializationType": "WFTextTokenString",
    }

    # Format End Date → HH:mm  
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.format.date",
        "WFWorkflowActionParameters": {
            "WFDateFormatStyle": "Custom",
            "WFDateFormat": "HH:mm",
            "WFDate": end_date_ref,
        },
    })

    # Set variable WakeTime
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.setvariable",
        "WFWorkflowActionParameters": {
            "WFVariableName": "WakeTime",
        },
    })

    # ============================================================
    # ACTION 5: Get date string for the API (yyyy-MM-dd)
    # ============================================================
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.format.date",
        "WFWorkflowActionParameters": {
            "WFDateFormatStyle": "Custom",
            "WFDateFormat": "yyyy-MM-dd",
            "WFDate": end_date_ref,
        },
    })

    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.setvariable",
        "WFWorkflowActionParameters": {
            "WFVariableName": "DateStr",
        },
    })

    # ============================================================
    # ACTION 6: POST to API (auto data)
    # ============================================================
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "WFURL": API_URL,
            "WFHTTPMethod": "POST",
            "WFHTTPBodyType": "JSON",
            "WFJSONValues": {
                "Value": {
                    "WFDictionaryFieldValueItems": [
                        {
                            "WFItemType": 0,
                            "WFKey": {"Value": {"string": "token"}, "WFSerializationType": "WFTextTokenString"},
                            "WFValue": {"Value": {"string": AGENT_TOKEN}, "WFSerializationType": "WFTextTokenString"},
                        },
                        {
                            "WFItemType": 0,
                            "WFKey": {"Value": {"string": "date"}, "WFSerializationType": "WFTextTokenString"},
                            "WFValue": var_ref("DateStr"),
                        },
                        {
                            "WFItemType": 0,
                            "WFKey": {"Value": {"string": "sleep_time"}, "WFSerializationType": "WFTextTokenString"},
                            "WFValue": var_ref("SleepTime"),
                        },
                        {
                            "WFItemType": 0,
                            "WFKey": {"Value": {"string": "wake_time"}, "WFSerializationType": "WFTextTokenString"},
                            "WFValue": var_ref("WakeTime"),
                        },
                    ],
                },
                "WFSerializationType": "WFDictionaryFieldValue",
            },
        },
    })

    # Show notification (auto)
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
        "WFWorkflowActionParameters": {
            "WFNotificationActionTitle": "Sleep Synced ✓",
            "WFNotificationActionBody": {
                "Value": {
                    "string": "Slept \ufffc → Woke \ufffc",
                    "attachmentsByRange": {
                        "{6, 1}": {"Type": "Variable", "VariableName": "SleepTime"},
                        "{16, 1}": {"Type": "Variable", "VariableName": "WakeTime"},
                    },
                },
                "WFSerializationType": "WFTextTokenString",
            },
        },
    })

    # ============================================================
    # OTHERWISE — Manual fallback
    # ============================================================
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": if_group_id,
            "WFControlFlowMode": 1,
        },
    })

    # Ask sleep time
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.ask",
        "WFWorkflowActionParameters": {
            "WFAskActionPrompt": "What time did you go to sleep?",
            "WFInputType": "Time",
        },
    })
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.format.date",
        "WFWorkflowActionParameters": {
            "WFDateFormatStyle": "Custom",
            "WFDateFormat": "HH:mm",
        },
    })
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.setvariable",
        "WFWorkflowActionParameters": {
            "WFVariableName": "ManualSleep",
        },
    })

    # Ask wake time
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.ask",
        "WFWorkflowActionParameters": {
            "WFAskActionPrompt": "What time did you wake up?",
            "WFInputType": "Time",
        },
    })
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.format.date",
        "WFWorkflowActionParameters": {
            "WFDateFormatStyle": "Custom",
            "WFDateFormat": "HH:mm",
        },
    })
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.setvariable",
        "WFWorkflowActionParameters": {
            "WFVariableName": "ManualWake",
        },
    })

    # POST manual data
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "WFURL": API_URL,
            "WFHTTPMethod": "POST",
            "WFHTTPBodyType": "JSON",
            "WFJSONValues": {
                "Value": {
                    "WFDictionaryFieldValueItems": [
                        {
                            "WFItemType": 0,
                            "WFKey": {"Value": {"string": "token"}, "WFSerializationType": "WFTextTokenString"},
                            "WFValue": {"Value": {"string": AGENT_TOKEN}, "WFSerializationType": "WFTextTokenString"},
                        },
                        {
                            "WFItemType": 0,
                            "WFKey": {"Value": {"string": "sleep_time"}, "WFSerializationType": "WFTextTokenString"},
                            "WFValue": var_ref("ManualSleep"),
                        },
                        {
                            "WFItemType": 0,
                            "WFKey": {"Value": {"string": "wake_time"}, "WFSerializationType": "WFTextTokenString"},
                            "WFValue": var_ref("ManualWake"),
                        },
                    ],
                },
                "WFSerializationType": "WFDictionaryFieldValue",
            },
        },
    })

    # Notification (manual)
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
        "WFWorkflowActionParameters": {
            "WFNotificationActionTitle": "Sleep Synced (Manual) ✓",
            "WFNotificationActionBody": {
                "Value": {
                    "string": "Slept \ufffc → Woke \ufffc",
                    "attachmentsByRange": {
                        "{6, 1}": {"Type": "Variable", "VariableName": "ManualSleep"},
                        "{16, 1}": {"Type": "Variable", "VariableName": "ManualWake"},
                    },
                },
                "WFSerializationType": "WFTextTokenString",
            },
        },
    })

    # ============================================================
    # END IF
    # ============================================================
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": if_group_id,
            "WFControlFlowMode": 2,
        },
    })

    # Build the workflow
    workflow = {
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowClientVersion": "2302.0.4",
        "WFWorkflowClientRelease": "2302.0.4",
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 4282601983,
            "WFWorkflowIconGlyphNumber": 59770,
        },
        "WFWorkflowImportQuestions": [],
        "WFWorkflowTypes": ["NCWidget", "WatchKit"],
        "WFWorkflowInputContentItemClasses": [
            "WFAppStoreAppContentItem",
            "WFArticleContentItem",
            "WFContactContentItem",
            "WFDateContentItem",
            "WFEmailAddressContentItem",
            "WFGenericFileContentItem",
            "WFImageContentItem",
            "WFiTunesProductContentItem",
            "WFLocationContentItem",
            "WFDCMapsLinkContentItem",
            "WFAVAssetContentItem",
            "WFPDFContentItem",
            "WFPhoneNumberContentItem",
            "WFRichTextContentItem",
            "WFSafariWebPageContentItem",
            "WFStringContentItem",
            "WFURLContentItem",
        ],
        "WFWorkflowActions": actions,
    }

    return workflow


def main():
    output_path = "/tmp/SleepSync-V4.shortcut"
    signed_path = None
    
    # Check for command line arg for output
    if len(sys.argv) > 1:
        signed_path = sys.argv[1]
    
    workflow = build_shortcut()
    
    # Write binary plist
    with open(output_path, "wb") as f:
        plistlib.dump(workflow, f, fmt=plistlib.FMT_BINARY)
    
    print(f"✅ Shortcut generated: {output_path}")
    
    # Sign it
    final_path = signed_path or output_path.replace(".shortcut", "-signed.shortcut")
    try:
        result = subprocess.run(
            ["shortcuts", "sign", "-i", output_path, "-o", final_path, "-m", "anyone"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"✅ Signed: {final_path}")
            return final_path
        else:
            print(f"⚠️  Sign warning (may still work): {result.stderr[:200]}")
            # Check if output file exists anyway
            if os.path.exists(final_path):
                print(f"✅ Signed file exists: {final_path}")
                return final_path
    except FileNotFoundError:
        print("⚠️  'shortcuts' CLI not found. File saved unsigned.")
    
    return output_path


if __name__ == "__main__":
    path = main()
    print(f"\n📱 AirDrop this file to your iPhone: {path}")
