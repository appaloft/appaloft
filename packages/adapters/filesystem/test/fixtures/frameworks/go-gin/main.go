package main

import (
	"os"

	"github.com/gin-gonic/gin"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	router := gin.New()
	router.GET("/", func(context *gin.Context) {
		context.String(200, "Go Gin fixture ready")
	})

	if err := router.Run("0.0.0.0:" + port); err != nil {
		panic(err)
	}
}
