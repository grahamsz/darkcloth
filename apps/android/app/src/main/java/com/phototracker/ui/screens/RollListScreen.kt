package com.phototracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
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

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { showCreateDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = "Start Roll")
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            Text(
                "Rolls",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(16.dp)
            )

            if (uiState.isLoading && uiState.rolls.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (uiState.error != null && uiState.rolls.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(uiState.error!!, color = MaterialTheme.colorScheme.error)
                }
            } else {
                LazyColumn {
                    items(uiState.rolls) { roll ->
                        RollItem(roll = roll)
                        Divider()
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
fun RollItem(roll: Roll) {
    ListItem(
        headlineContent = { Text(roll.name) },
        supportingContent = { 
            Text("Loaded: ${roll.loadedAt ?: "Unknown"} | Developed: ${roll.developedAt ?: "No"}")
        }
    )
}
