package com.phototracker.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.phototracker.api.ApiClient
import com.phototracker.data.model.FilmStock
import com.phototracker.data.model.Roll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RollUiState(
    val isLoading: Boolean = false,
    val rolls: List<Roll> = emptyList(),
    val filmStocks: List<FilmStock> = emptyList(),
    val error: String? = null,
    val isCreating: Boolean = false
)

class RollViewModel(application: Application) : AndroidViewModel(application) {
    private val apiService = ApiClient.getApiService(application)

    private val _uiState = MutableStateFlow(RollUiState())
    val uiState: StateFlow<RollUiState> = _uiState.asStateFlow()

    fun loadData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val rollsRes = apiService.listRolls()
                val filmsRes = apiService.listFilmStocks()

                if (rollsRes.isSuccessful && filmsRes.isSuccessful) {
                    _uiState.update { it.copy(
                        isLoading = false,
                        rolls = rollsRes.body()?.items ?: emptyList(),
                        filmStocks = filmsRes.body()?.items ?: emptyList()
                    ) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Failed to load data") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }

    fun createRoll(name: String, filmId: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true) }
            try {
                val body = mapOf(
                    "name" to name,
                    "film_id" to filmId
                )
                val response = apiService.createRoll(body)
                if (response.isSuccessful) {
                    _uiState.update { it.copy(isCreating = false) }
                    loadData()
                } else {
                    _uiState.update { it.copy(isCreating = false, error = "Failed to create roll") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isCreating = false, error = e.message ?: "An error occurred") }
            }
        }
    }
}
