param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [int]$TimeoutSeconds = 25,

    [int]$BrowserProcessId = 0
)

$ErrorActionPreference = "Stop"

try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes

    $root = [System.Windows.Automation.AutomationElement]::RootElement

    # Tell the Node.js caller that the controller is ready to listen for the context menu.
    [Console]::Out.WriteLine("READY")

    $menuDeadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $saveItem = $null

    $menuCondition = New-Object `
        System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::MenuItem
        )

    # Search for the native Chrome "Save image as" menu item.
    while ((Get-Date) -lt $menuDeadline) {
        $items = $root.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            $menuCondition
        )

        $matches = @()

        foreach ($item in $items) {
            try {
                $name = $item.Current.Name
                if ($name -match '(?i)^Save image as(?:\.{3}|…)?$') {
                    # Filter by BrowserProcessId if provided
                    if ($BrowserProcessId -gt 0) {
                        if ($item.Current.ProcessId -eq $BrowserProcessId) {
                            $matches += $item
                        }
                    } else {
                        $matches += $item
                    }
                }
            } catch {}
        }

        if ($matches.Count -eq 1) {
            $saveItem = $matches[0]
            break
        }

        if ($matches.Count -gt 1) {
            # Check if exactly one has keyboard focus
            $focused = $matches | Where-Object {
                try { $_.Current.HasKeyboardFocus } catch { $false }
            }
            if ($focused -and $focused.Count -eq 1) {
                $saveItem = $focused[0]
                break
            }
            throw "NATIVE_CONTEXT_MENU_AMBIGUOUS: Multiple Save image as items were found ($($matches.Count)). Refusing ambiguous selection."
        }

        Start-Sleep -Milliseconds 150
    }

    if (-not $saveItem) {
        throw "NATIVE_CONTEXT_MENU_NOT_FOUND: Native Chrome Save image as menu item was not found."
    }

    [Console]::Out.WriteLine("NATIVE_MENU_ITEM_FOUND")

    # Invoke the actual native menu command.
    $invokePattern = $null
    try {
        $invokePattern = $saveItem.GetCurrentPattern(
            [System.Windows.Automation.InvokePattern]::Pattern
        )
    } catch {}

    if ($invokePattern) {
        $invokePattern.Invoke()
    } else {
        $selectPattern = $saveItem.GetCurrentPattern(
            [System.Windows.Automation.SelectionItemPattern]::Pattern
        )
        $selectPattern.Select()
    }

    # Wait for the native Windows Save As dialog.
    $dialogDeadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $dialog = $null

    $windowCondition = New-Object `
        System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Window
        )

    while ((Get-Date) -lt $dialogDeadline) {
        $windows = $root.FindAll(
            [System.Windows.Automation.TreeScope]::Children,
            $windowCondition
        )

        foreach ($window in $windows) {
            try {
                if ($window.Current.Name -match '(?i)^Save As$') {
                    if ($BrowserProcessId -gt 0) {
                        if ($window.Current.ProcessId -eq $BrowserProcessId) {
                            $dialog = $window
                            break
                        }
                    } else {
                        $dialog = $window
                        break
                    }
                }
            } catch {}
        }

        if ($dialog) {
            break
        }

        Start-Sleep -Milliseconds 150
    }

    if (-not $dialog) {
        throw "NATIVE_SAVE_AS_DIALOG_NOT_FOUND: Windows Save As dialog did not appear."
    }

    [Console]::Out.WriteLine("SAVE_DIALOG_FOUND")

    # Locate the actual File name field.
    $editCondition = New-Object `
        System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Edit
        )

    $edits = $dialog.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        $editCondition
    )

    $fileNameFields = @()

    foreach ($edit in $edits) {
        try {
            if ($edit.Current.Name -match '(?i)^File name:?\s*$' -or $edit.Current.AutomationId -eq '1001') {
                $fileNameFields += $edit
            }
        } catch {}
    }

    if ($fileNameFields.Count -gt 1) {
        $id1001 = $fileNameFields | Where-Object { $_.Current.AutomationId -eq '1001' }
        if ($id1001 -and $id1001.Count -eq 1) {
            $fileNameFields = @($id1001[0])
        }
    }

    if ($fileNameFields.Count -ne 1) {
        throw "NATIVE_FILENAME_FIELD_NOT_FOUND: Could not uniquely identify the Windows Save As filename field."
    }

    $fileNamePattern = $fileNameFields[0].GetCurrentPattern(
        [System.Windows.Automation.ValuePattern]::Pattern
    )

    # Set the destination path.
    $fileNamePattern.SetValue($OutputPath)
    [Console]::Out.WriteLine("FILE_NAME_SET")

    # Find the actual Save button.
    $buttonCondition = New-Object `
        System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Button
        )

    $buttons = $dialog.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        $buttonCondition
    )

    $saveButtons = @()

    foreach ($button in $buttons) {
        try {
            if ($button.Current.Name -match '(?i)^Save$' -or $button.Current.AutomationId -eq '1') {
                $saveButtons += $button
            }
        } catch {}
    }

    if ($saveButtons.Count -gt 1) {
        $id1 = $saveButtons | Where-Object { $_.Current.AutomationId -eq '1' }
        if ($id1 -and $id1.Count -eq 1) {
            $saveButtons = @($id1[0])
        }
    }

    if ($saveButtons.Count -ne 1) {
        throw "NATIVE_SAVE_BUTTON_NOT_FOUND: Could not uniquely identify the Save button."
    }

    $savePattern = $saveButtons[0].GetCurrentPattern(
        [System.Windows.Automation.InvokePattern]::Pattern
    )

    $savePattern.Invoke()
    [Console]::Out.WriteLine("SAVE_BUTTON_INVOKED")

    # Verify that the actual file has been written.
    $fileDeadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $fileDeadline) {
        if (Test-Path -LiteralPath $OutputPath -PathType Leaf) {
            $file = Get-Item -LiteralPath $OutputPath
            if ($file.Length -gt 0) {
                [Console]::Out.WriteLine("FILE_EXISTS_VERIFIED")

                [ordered]@{
                    success = $true
                    path = $file.FullName
                    fileSize = $file.Length
                } | ConvertTo-Json -Compress

                exit 0
            }
        }

        Start-Sleep -Milliseconds 200
    }

    throw "NATIVE_FILE_CREATION_TIMEOUT: Save As was invoked, but output file was not created within deadline."
}
catch {
    [ordered]@{
        success = $false
        error = $_.Exception.Message
    } | ConvertTo-Json -Compress

    exit 1
}
