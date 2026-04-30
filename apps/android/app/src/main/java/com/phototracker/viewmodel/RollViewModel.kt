package com.phototracker.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.phototracker.api.ApiClient
import com.phototracker.data.model.Roll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RollUiState(
    val isLoading: Boolean = false,
    val rolls: List<Roll> = emptyList(),
    val error: String? = null
)

class RollViewModel(application: Application) : AndroidViewModel(application) {
    private val apiService = ApiClient.getApiService(application)

    private val _uiState = MutableStateFlow(RollUiState())
    val uiState: StateFlow<RollUiState> = _uiState.asStateFlow()

    fun loadRolls() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val response = apiService.listRolls()
                if (response.isSuccessful) {
                    _uiState.update { it.copy(isLoading = false, rolls = response.body()?.items ?: emptyList()) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Failed to load rolls") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }
}
