# SQL Visualizer

SQL Visualizer is a Visual Studio Code extension that allows you to convert SQL files into SVG diagrams, making it easy to visualize database structures directly in the editor.

## Features


- SQL to SVG Conversion: Transform SQL files into SVG diagrams to visualize tables and their relationships.

- Quick access via Explorer: Right-click on a .sql file in the file explorer to convert it.

- Customizable Name: Choose the output file name or use an auto-generated default name.

# How to Use

Open a .sql file in Visual Studio Code.
Right-click on the file and select the **Convert SQL to Diagram** option.
Enter a name for the output file or leave it blank to use the default name.
The generated SVG file will be saved in the working directory.
Or use the command palette to execute the conversion.

## Demo

[![How to use SQL Visualizer](https://img.youtube.com/vi/zOQM5RPOCFQ/0.jpg)](https://youtu.be/zOQM5RPOCFQ)



# Known Issues

No known issues at this time. If you encounter any issues or bugs, feel free to report them by [opening an issue](https://github.com/RiuriII/sql-diagram-visualizer/issues) in the GitHub repository.


# Release Notes

## 1.0.4

- Internal code refactoring for better organization and maintenance.
- Improved SQL parsing logic, making the process more consistent.
- Foundation prepared for future parser extensions, such as support for syntax variations and other SQL dialects (e.g., PostgreSQL).