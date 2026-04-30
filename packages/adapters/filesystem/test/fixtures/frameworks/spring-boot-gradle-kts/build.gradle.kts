plugins {
  java
  id("org.springframework.boot") version "3.4.4"
}

rootProject.name = "spring-boot-gradle-kts"
version = "0.0.1-SNAPSHOT"

dependencies {
  implementation("org.springframework.boot:spring-boot-starter-web:3.4.4")
}
