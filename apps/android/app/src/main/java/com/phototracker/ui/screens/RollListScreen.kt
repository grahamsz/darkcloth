package com.phototracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.phototracker.data.model.Roll
import com.phototracker.viewmodel.RollViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RollListScreen(viewModel: RollViewModel = viewModel()) {
    val uiState by viewModel.uiState.collectAsState()
    var showCreateDialog by remember { mutableStateOf(false) }
    var editingRoll by remember { mutableStateOf<Roll?>(null) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showCreateDialog = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            ) {
                Icon(Icons.Default.Add, contentDescription = "Start Roll")
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (uiState.isLoading && uiState.rolls.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (uiState.error != null && uiState.rolls.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(uiState.error!!, color = MaterialTheme.colorScheme.error)
                }
            } else if (uiState.rolls.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No rolls yet. Tap + to start one.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn {
                    items(uiState.rolls, key = { it.id }) { roll ->
                        RollItem(
                            roll = roll,
                            onDevelop = { viewModel.markRollDeveloped(it) },
                            onEdit = { editingRoll = roll }
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateRollDialog(
            filmStocks = uiState.filmStocks.map { it.id to it.name },
            onDismiss = { showCreateDialog = false },
            onCreate = { name, filmId ->
                viewModel.createRoll(name, filmId)
                showCreateDialog = false
            }
        )
    }

    editingRoll?.let { roll ->
        EditRollDialog(
            roll = roll,
            filmStocks = uiState.filmStocks.map { it.id to it.name },
            onDismiss = { editingRoll = null },
            onSave = { name, filmId ->
                viewModel.updateRoll(roll.id, name, filmId)
                editingRoll = null
            }
        )
    }

    LaunchedEffect(Unit) {
        viewModel.loadData()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateRollDialog(
    filmStocks: List<Pair<String, String>>,
    onDismiss: () -> Unit,
    onCreate: (String, String?) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var selectedFilmId by remember { mutableStateOf<String?>(null) }
    var expanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Start New Roll") },
        text = {
            Column {
                TextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Roll Name") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(16.dp))
                
                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = !expanded }
                ) {
                    TextField(
                        value = filmStocks.find { it.first == selectedFilmId }?.second ?: "Select Film Stock",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Film Stock") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                        modifier = Modifier.menuAnchor().fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("None") },
                            onClick = {
                                selectedFilmId = null
                                expanded = false
                            }
                        )
                        filmStocks.forEach { (id, filmName) ->
                            DropdownMenuItem(
                                text = { Text(filmName) },
                                onClick = {
                                    selectedFilmId = id
                                    expanded = false
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onCreate(name, selectedFilmId) },
                enabled = name.isNotBlank()
            ) {
                Text("Create")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
fun RollItem(roll: Roll, onDevelop: (String) -> Unit, onEdit: () -> Unit = {}) {
    ListItem(
        headlineContent = { Text(roll.name) },
        supportingContent = {
            Column {
                Text(
                    "Loaded: ${roll.loadedAt?.take(10) ?: "Unknown"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                roll.developedAt?.let {
                    Text(
                        "Developed: ${it.take(10)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        trailingContent = {
            Row {
                IconButton(onClick = onEdit) {
                    Icon(
                        Icons.Outlined.Edit,
                        contentDescription = "Edit roll",
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (roll.developedAt == null) {
                    TextButton(onClick = { onDevelop(roll.id) }) {
                        Text("Develop")
                    }
                }
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditRollDialog(
    roll: Roll,
    filmStocks: List<Pair<String, String>>,
    onDismiss: () -> Unit,
    onSave: (String, String?) -> Unit
) {
    var name by remember { mutableStateOf(roll.name) }
    var selectedFilmId by remember { mutableStateOf(roll.filmId) }
    var expanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Roll") },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Roll Name") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = !expanded }
                ) {
                    OutlinedTextField(
                        value = filmStocks.find { it.first == selectedFilmId }?.second ?: "None",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Film Stock") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                        modifier = Modifier.menuAnchor().fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("None") },
                            onClick = { selectedFilmId = null; expanded = false }
                        )
                        filmStocks.forEach { (id, filmName) ->
                            DropdownMenuItem(
                                text = { Text(filmName) },
                                onClick = { selectedFilmId = id; expanded = false }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(name, selectedFilmId) },
                enabled = name.isNotBlank()
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
