package com.phototracker.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.phototracker.api.ApiClient
import com.phototracker.data.model.Camera
import com.phototracker.data.model.FilmStock
import com.phototracker.data.model.Lens
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class GearUiState(
    val isLoading: Boolean = false,
    val cameras: List<Camera> = emptyList(),
    val lenses: List<Lens> = emptyList(),
    val films: List<FilmStock> = emptyList(),
    val error: String? = null
)

class GearViewModel(application: Application) : AndroidViewModel(application) {
    private val apiService = ApiClient.getApiService(application)

    private val _uiState = MutableStateFlow(GearUiState())
    val uiState: StateFlow<GearUiState> = _uiState.asStateFlow()

    fun loadGear() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                // Fetch all gear in parallel
                val camerasDef = apiService.listCameras()
                val lensesDef = apiService.listLenses()
                val filmsDef = apiService.listFilmStocks()

                if (camerasDef.isSuccessful && lensesDef.isSuccessful && filmsDef.isSuccessful) {
                    _uiState.update { it.copy(
                        isLoading = false,
                        cameras = camerasDef.body()?.items ?: emptyList(),
                        lenses = lensesDef.body()?.items ?: emptyList(),
                        films = filmsDef.body()?.items ?: emptyList()
                    ) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Failed to load gear") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }
}
