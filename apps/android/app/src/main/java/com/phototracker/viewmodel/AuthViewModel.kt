package com.phototracker.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.phototracker.api.ApiClient
import com.phototracker.data.AuthManager
import com.phototracker.data.model.ErrorResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AuthUiState(
    val isLoading: Boolean = false,
    val isLoggedIn: Boolean = false,
    val error: String? = null
)

class AuthViewModel(application: Application) : AndroidViewModel(application) {
    private val authManager = AuthManager(application)
    private val apiService = ApiClient.getApiService(application)

    private val _uiState = MutableStateFlow(AuthUiState(isLoggedIn = authManager.isLoggedIn()))
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val response = apiService.login(mapOf("email" to email, "password" to password))
                if (response.isSuccessful) {
                    val authResponse = response.body()!!
                    authManager.saveToken(authResponse.token)
                    _uiState.update { it.copy(isLoading = false, isLoggedIn = true) }
                } else {
                    val errorBody = response.errorBody()?.string()
                    val errorMessage = try {
                        Gson().fromJson(errorBody, ErrorResponse::class.java).error
                    } catch (e: Exception) {
                        "Login failed"
                    }
                    _uiState.update { it.copy(isLoading = false, error = errorMessage) }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }

    fun register(email: String, password: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val response = apiService.register(mapOf("email" to email, "password" to password))
                if (response.isSuccessful) {
                    val authResponse = response.body()!!
                    authManager.saveToken(authResponse.token)
                    _uiState.update { it.copy(isLoading = false, isLoggedIn = true) }
                } else {
                    val errorBody = response.errorBody()?.string()
                    val errorMessage = try {
                        Gson().fromJson(errorBody, ErrorResponse::class.java).error
                    } catch (e: Exception) {
                        "Registration failed"
                    }
                    _uiState.update { it.copy(isLoading = false, error = errorMessage) }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }

    fun logout() {
        authManager.clearToken()
        _uiState.update { it.copy(isLoggedIn = false) }
    }
}
