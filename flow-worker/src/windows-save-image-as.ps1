param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [int]$TimeoutSeconds = 25
)

$ErrorActionPreference = "Stop"

try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes

    $root = [System.Windows.Automation.AutomationElement]::RootElement

    # Tell the Node.js caller that the controller is ready.
    Write-Output "READY"

    $menuDeadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $saveItem = $null

    $menuCondition = New-Object `
        System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::MenuItem
        )

    # Find the actual native Chrome "Save image as" menu item.
    while ((Get-Date) -lt $menuDeadline) {

        $items = $root.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            $menuCondition
        )

        $matches = @()

        foreach ($item in $items) {
            $name = $item.Current.Name

            if ($name -match '(?i)^Save image as(?:\.{3}|…)?$') {
                $matches += $item
            }
        }

        if ($matches.Count -eq 1) {
            $saveItem = $matches[0]
            break
        }

        if ($matches.Count -gt 1) {
            # If multiple matching items found (e.g. nested or across windows), pick the currently focused / top-level visible one
            $focused = $matches | Where-Object {
                try { $_.Current.HasKeyboardFocus } catch { $false }
            }
            if ($focused -and $focused.Count -eq 1) {
                $saveItem = $focused[0]
                break
            }
            $saveItem = $matches[-1]
            break
        }

        Start-Sleep -Milliseconds 150
    }

    if (-not $saveItem) {
        throw "Native Chrome Save image as menu item was not found."
    }

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
        # Fallback to SelectionItemPattern if invoke pattern not exposed
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
            if ($window.Current.Name -match '(?i)^Save As$') {
                $dialog = $window
                break
            }
        }

        if ($dialog) {
            break
        }

        Start-Sleep -Milliseconds 150
    }

    if (-not $dialog) {
        throw "Windows Save As dialog did not appear."
    }

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
        if ($edit.Current.Name -match '(?i)^File name:?\s*$' -or $edit.Current.AutomationId -eq '1001') {
            $fileNameFields += $edit
        }
    }

    if ($fileNameFields.Count -gt 1) {
        # Disambiguate if multiple match
        $id1001 = $fileNameFields | Where-Object { $_.Current.AutomationId -eq '1001' }
        if ($id1001 -and $id1001.Count -eq 1) {
            $fileNameFields = @($id1001[0])
        }
    }

    if ($fileNameFields.Count -ne 1) {
        # Fallback: if no named edit found, check if the first edit is inside the file name box
        if ($edits.Count -gt 0) {
            $fileNameFields = @($edits[0])
        } else {
            throw "Could not uniquely identify the Windows Save As filename field."
        }
    }

    $fileNamePattern = $fileNameFields[0].GetCurrentPattern(
        [System.Windows.Automation.ValuePattern]::Pattern
    )

    # Set the full job-specific destination.
    $fileNamePattern.SetValue($OutputPath)

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
        if ($button.Current.Name -match '(?i)^Save$' -or $button.Current.AutomationId -eq '1') {
            $saveButtons += $button
        }
    }

    if ($saveButtons.Count -gt 1) {
        $id1 = $saveButtons | Where-Object { $_.Current.AutomationId -eq '1' }
        if ($id1 -and $id1.Count -eq 1) {
            $saveButtons = @($id1[0])
        }
    }

    if ($saveButtons.Count -ne 1) {
        throw "Could not uniquely identify the Save button."
    }

    $savePattern = $saveButtons[0].GetCurrentPattern(
        [System.Windows.Automation.InvokePattern]::Pattern
    )

    $savePattern.Invoke()

    # Verify that the actual file has been written.
    $fileDeadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $fileDeadline) {

        if (Test-Path -LiteralPath $OutputPath -PathType Leaf) {

            $file = Get-Item -LiteralPath $OutputPath

            if ($file.Length -gt 0) {

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

    throw "Save As was invoked, but the output file was not created."

}
catch {
    [ordered]@{
        success = $false
        error = $_.Exception.Message
    } | ConvertTo-Json -Compress

    exit 1
}
