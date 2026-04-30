package com.phototracker.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.phototracker.viewmodel.AddPhotoViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddPhotoScreen(
    onBack: () -> Unit,
    viewModel: AddPhotoViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val scrollState = rememberScrollState()
    val context = LocalContext.current

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        ) {
            viewModel.captureLocation()
        }
    }

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            onBack()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Log Photograph") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refreshData() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .padding(16.dp)
                .verticalScroll(scrollState)
        ) {
            // Gear Selection
            GearDropdown(
                label = "Roll",
                options = uiState.rolls.map { it.id to it.name },
                selectedId = uiState.rollId,
                onSelected = { viewModel.updateRollId(it) }
            )
            Spacer(modifier = Modifier.height(8.dp))

            GearDropdown(
                label = "Camera",
                options = uiState.cameras.map { it.id to it.name },
                selectedId = uiState.cameraId,
                onSelected = { viewModel.updateCameraId(it) }
            )
            Spacer(modifier = Modifier.height(8.dp))

            GearDropdown(
                label = "Lens",
                options = uiState.lenses.map { it.id to it.name },
                selectedId = uiState.lensId,
                onSelected = { viewModel.updateLensId(it) }
            )
            Spacer(modifier = Modifier.height(8.dp))

            GearDropdown(
                label = "Film Stock",
                options = uiState.filmStocks.map { it.id to it.name },
                selectedId = uiState.filmId,
                onSelected = { viewModel.updateFilmId(it) }
            )
            Spacer(modifier = Modifier.height(16.dp))

            Divider()
            Spacer(modifier = Modifier.height(16.dp))

            TextField(
                value = uiState.frameNumber,
                onValueChange = { viewModel.updateFrameNumber(it) },
                label = { Text("Frame Number") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
            TextField(
                value = uiState.notes,
                onValueChange = { viewModel.updateNotes(it) },
                label = { Text("Notes") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))

            Row {
                TextField(
                    value = uiState.aperture,
                    onValueChange = { viewModel.updateAperture(it) },
                    label = { Text("Aperture") },
                    modifier = Modifier.weight(1f)
                )
                Spacer(modifier = Modifier.width(8.dp))
                TextField(
                    value = uiState.shutterSpeed,
                    onValueChange = { viewModel.updateShutterSpeed(it) },
                    label = { Text("Shutter") },
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row {
                TextField(
                    value = uiState.iso?.toString() ?: "",
                    onValueChange = { viewModel.updateIso(it.toIntOrNull()) },
                    label = { Text("ISO") },
                    modifier = Modifier.weight(1f)
                )
                Spacer(modifier = Modifier.width(8.dp))
                TextField(
                    value = uiState.exposureCompensation,
                    onValueChange = { viewModel.updateExposureCompensation(it) },
                    label = { Text("Exp. Comp.") },
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(16.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (uiState.latitude != null) 
                            "GPS: ${"%.5f".format(uiState.latitude)}, ${"%.5f".format(uiState.longitude)}"
                            else "GPS: Not captured",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                Button(onClick = {
                    val hasFineLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    val hasCoarseLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

                    if (hasFineLocation || hasCoarseLocation) {
                        viewModel.captureLocation()
                    } else {
                        permissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    }
                }) {
                    Text("Capture")
                }
            }
            Spacer(modifier = Modifier.height(32.dp))

            if (uiState.error != null) {
                Text(uiState.error!!, color = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.height(8.dp))
            }

            Button(
                onClick = { viewModel.save() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isLoading
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                } else {
                    Text("Save Photograph")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GearDropdown(
    label: String,
    options: List<Pair<String, String>>,
    selectedId: String?,
    onSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedOption = options.find { it.first == selectedId }?.second ?: "Select $label"

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
        modifier = Modifier.fillMaxWidth()
    ) {
        TextField(
            value = selectedOption,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            colors = ExposedDropdownMenuDefaults.textFieldColors(),
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            DropdownMenuItem(
                text = { Text("None") },
                onClick = {
                    onSelected(null)
                    expanded = false
                }
            )
            options.forEach { (id, name) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = {
                        onSelected(id)
                        expanded = false
                    }
                )
            }
        }
    }
}
